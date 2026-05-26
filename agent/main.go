package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

// ── Version — bump this each time you build and deploy a new .exe ─────────────
// The API holds LATEST_AGENT_VERSION; if agent's version is lower, it self-updates.
const AGENT_VERSION = 14

// ── Config ────────────────────────────────────────────────────────────────────

const API_URL = "https://device-management-xi.vercel.app"

type Config struct {
	Token    string `json:"token"`
	DeviceID string `json:"device_id"`
}

func configPath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("PROGRAMDATA"), "DeviceManager", "config.json")
	}
	return filepath.Join(os.TempDir(), "devicemanager_config.json")
}

func agentDir() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("PROGRAMDATA"), "DeviceManager")
	}
	return filepath.Join(os.TempDir(), "DeviceManager")
}

func transferDir() string {
	return filepath.Join(agentDir(), "Transfers")
}

func loadConfig() (*Config, error) {
	data, err := os.ReadFile(configPath())
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func saveConfig(cfg *Config) error {
	path := configPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

// ── System Info ───────────────────────────────────────────────────────────────

type HardwareInfo struct {
	Hostname     string   `json:"hostname"`
	OS           string   `json:"os"`
	OSVersion    string   `json:"os_version"`
	OSBuild      string   `json:"os_build"`
	KernelArch   string   `json:"kernel_arch"`
	CPUBrand     string   `json:"cpu_brand"`
	CPUCores     int      `json:"cpu_cores"`
	CPUThreads   int      `json:"cpu_threads"`
	CPUUsage     float64  `json:"cpu_usage"`
	RAMTotal     uint64   `json:"ram_total"`
	RAMUsed      uint64   `json:"ram_used"`
	RAMFree      uint64   `json:"ram_free"`
	DiskTotal    uint64   `json:"disk_total"`
	DiskUsed     uint64   `json:"disk_used"`
	DiskFree     uint64   `json:"disk_free"`
	IPAddresses  []string `json:"ip_addresses"`
	MACAddress   string   `json:"mac_address"`
	SerialNumber string   `json:"serial_number"`
	LoggedUser   string   `json:"logged_user"`
	Uptime       uint64   `json:"uptime"`
	BootTime     uint64   `json:"boot_time"`
	Platform     string   `json:"platform"`
}

// getSerialNumber reads the BIOS serial number on Windows via wmic
func getSerialNumber() string {
	if runtime.GOOS != "windows" {
		return ""
	}
	out, err := exec.Command("wmic", "bios", "get", "serialnumber", "/value").Output()
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(strings.ReplaceAll(line, "\r", ""))
		if strings.HasPrefix(strings.ToLower(line), "serialnumber=") {
			val := strings.TrimSpace(line[13:])
			if val == "" ||
				strings.EqualFold(val, "To be filled by O.E.M.") ||
				strings.EqualFold(val, "Default string") ||
				strings.EqualFold(val, "System Serial Number") ||
				strings.EqualFold(val, "None") ||
				val == "0" {
				return ""
			}
			return val
		}
	}
	return ""
}

func collectHardware() HardwareInfo {
	h := HardwareInfo{}

	if info, err := host.Info(); err == nil {
		h.Hostname   = info.Hostname
		h.OS         = info.Platform + " " + info.PlatformFamily
		h.OSVersion  = info.PlatformVersion
		h.OSBuild    = info.KernelVersion
		h.KernelArch = info.KernelArch
		h.Uptime     = info.Uptime
		h.BootTime   = info.BootTime
		h.Platform   = info.OS
	}

	h.SerialNumber = getSerialNumber()

	if users, err := host.Users(); err == nil && len(users) > 0 {
		h.LoggedUser = users[0].User
	}

	if cpuInfo, err := cpu.Info(); err == nil && len(cpuInfo) > 0 {
		h.CPUBrand   = cpuInfo[0].ModelName
		h.CPUCores   = int(cpuInfo[0].Cores)
		h.CPUThreads = len(cpuInfo)
	}
	if usage, err := cpu.Percent(500*time.Millisecond, false); err == nil && len(usage) > 0 {
		h.CPUUsage = round2(usage[0])
	}

	if memInfo, err := mem.VirtualMemory(); err == nil {
		h.RAMTotal = memInfo.Total
		h.RAMUsed  = memInfo.Used
		h.RAMFree  = memInfo.Available
	}

	parts, _ := disk.Partitions(false)
	for _, p := range parts {
		if u, err := disk.Usage(p.Mountpoint); err == nil {
			h.DiskTotal += u.Total
			h.DiskUsed  += u.Used
			h.DiskFree  += u.Free
		}
	}

	ifaces, _ := net.Interfaces()
	var ips4, ips6 []string
	for _, iface := range ifaces {
		name := strings.ToLower(iface.Name)
		if name == "lo" || name == "lo0" || strings.HasPrefix(name, "loopback") {
			continue
		}
		if h.MACAddress == "" &&
			iface.HardwareAddr != "" &&
			iface.HardwareAddr != "00:00:00:00:00:00" {
			h.MACAddress = iface.HardwareAddr
		}
		for _, addr := range iface.Addrs {
			ip := addr.Addr
			if idx := strings.Index(ip, "/"); idx != -1 {
				ip = ip[:idx]
			}
			if ip == "" || ip == "127.0.0.1" || ip == "::1" {
				continue
			}
			if strings.HasPrefix(strings.ToLower(ip), "fe80:") {
				continue
			}
			if strings.Contains(ip, ":") {
				ips6 = append(ips6, ip)
			} else {
				ips4 = append(ips4, ip)
			}
		}
	}
	h.IPAddresses = append(ips4, ips6...)

	return h
}

func round2(v float64) float64 {
	return float64(int(v*100)) / 100
}

// ── API calls ─────────────────────────────────────────────────────────────────

type RegisterRequest struct {
	Action string       `json:"action"`
	HW     HardwareInfo `json:"hardware"`
}

type RegisterResponse struct {
	OK       bool   `json:"ok"`
	Token    string `json:"token"`
	DeviceID string `json:"device_id"`
	Error    string `json:"error"`
}

// ── Installed Software ────────────────────────────────────────────────────────

type SoftwareItem struct {
	Name        string `json:"name"`
	Version     string `json:"version,omitempty"`
	Publisher   string `json:"publisher,omitempty"`
	InstallDate string `json:"install_date,omitempty"`
}

// softwareTimestampPath returns the file used to track when software was last collected.
func softwareTimestampPath() string {
	return filepath.Join(agentDir(), "sw_collected.txt")
}

// shouldCollectSoftware returns true if software hasn't been collected in the last hour.
func shouldCollectSoftware() bool {
	data, err := os.ReadFile(softwareTimestampPath())
	if err != nil {
		return true // never collected
	}
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(string(data)))
	if err != nil {
		return true
	}
	return time.Since(t) > 60*time.Minute
}

func markSoftwareCollected() {
	_ = os.WriteFile(softwareTimestampPath(), []byte(time.Now().UTC().Format(time.RFC3339)), 0644)
}

// collectInstalledSoftware reads installed programs from the Windows registry via
// PowerShell. It reads both the 64-bit and 32-bit Uninstall keys, deduplicates by
// name, and returns them sorted alphabetically. Returns nil on non-Windows or error.
//
// Robustness measures:
//   - -ExecutionPolicy Bypass: works on corporate machines with restricted policies
//   - List<T> instead of $r+=: O(1) appends (avoids O(n²) slowdown for 100+ apps)
//   - UTF-8 output encoding: handles international software names correctly
//   - 20-second goroutine timeout: agent process never hangs
// writeLog appends a timestamped line to DeviceManager_log.txt in the agent dir.
// The user (or admin) can read this file to diagnose silent failures.
func writeLog(msg string) {
	logPath := filepath.Join(agentDir(), "DeviceManager_log.txt")
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "[%s] %s\n", time.Now().Format("2006-01-02 15:04:05"), msg)
}

// encodePS converts a PowerShell script string to UTF-16LE base64 so it can be
// passed via -EncodedCommand. This avoids all shell quoting / escaping problems.
func encodePS(script string) string {
	runes := []rune(script)
	b := make([]byte, len(runes)*2)
	for i, r := range runes {
		b[i*2] = byte(r)
		b[i*2+1] = byte(r >> 8)
	}
	return base64.StdEncoding.EncodeToString(b)
}

// psExe returns the full path to powershell.exe.
// The SYSTEM account (used by scheduled tasks) may have a minimal PATH, so
// we resolve the path explicitly rather than relying on PATH lookup.
func psExe() string {
	sysRoot := os.Getenv("SystemRoot")
	if sysRoot == "" {
		sysRoot = `C:\Windows`
	}
	p := filepath.Join(sysRoot, `System32\WindowsPowerShell\v1.0\powershell.exe`)
	if _, err := os.Stat(p); err == nil {
		return p
	}
	return "powershell" // fallback — works when PATH is set correctly
}

func collectInstalledSoftware() []SoftwareItem {
	if runtime.GOOS != "windows" {
		return nil
	}

	writeLog("software: starting collection")

	type res struct {
		items []SoftwareItem
		errMsg string
	}
	ch := make(chan res, 1)

	go func() {
		// Build script. List<object> gives O(1) .Add() — avoids the O(n²) $r+=
		// array copy pattern that hangs PowerShell on machines with 150+ apps.
		// -EncodedCommand (UTF-16LE base64) avoids all shell quoting issues.
		script :=
			`[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;` +
			`$l=[System.Collections.Generic.List[object]]::new();$s=@{};` +
			`foreach($p in @(` +
			`'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',` +
			`'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'` +
			`)){try{Get-ItemProperty $p -EA 0|?{$_.DisplayName}|%{` +
			`$n=$_.DisplayName.Trim();if(!$s[$n]){$s[$n]=1;` +
			`$l.Add([PSCustomObject]@{` +
			`name=$n;` +
			`version=$(if($_.DisplayVersion){$_.DisplayVersion.Trim()}else{''});` +
			`publisher=$(if($_.Publisher){$_.Publisher.Trim()}else{''});` +
			`install_date=$(if($_.InstallDate){$_.InstallDate.Trim()}else{''})` +
			`})}}}catch{}}` +
			`ConvertTo-Json -InputObject @($l|Sort-Object name) -Compress -Depth 2`

		cmd := exec.Command(
			psExe(),
			"-ExecutionPolicy", "Bypass",
			"-NonInteractive", "-NoProfile",
			"-EncodedCommand", encodePS(script),
		)
		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr

		if err := cmd.Run(); err != nil {
			se := stderr.String()
			if len(se) > 400 {
				se = se[:400]
			}
			ch <- res{nil, fmt.Sprintf("powershell exit error: %v | stderr: %s", err, se)}
			return
		}

		trimmed := bytes.TrimSpace(stdout.Bytes())
		// Strip UTF-8 BOM if present
		trimmed = bytes.TrimPrefix(trimmed, []byte{0xef, 0xbb, 0xbf})
		if len(trimmed) == 0 {
			se := stderr.String()
			if len(se) > 300 {
				se = se[:300]
			}
			ch <- res{nil, "powershell produced empty stdout; stderr: " + se}
			return
		}

		var items []SoftwareItem
		if err := json.Unmarshal(trimmed, &items); err != nil {
			raw := string(trimmed)
			if len(raw) > 300 {
				raw = raw[:300]
			}
			ch <- res{nil, fmt.Sprintf("json parse error: %v | raw output: %s", err, raw)}
			return
		}

		ch <- res{items, ""}
	}()

	// 45s timeout — generous for slow machines or large registry hives
	select {
	case r := <-ch:
		if r.errMsg != "" {
			writeLog("software error: " + r.errMsg)
			return nil
		}
		writeLog(fmt.Sprintf("software ok: %d apps collected", len(r.items)))
		return r.items
	case <-time.After(45 * time.Second):
		writeLog("software: timed out after 45s")
		return nil
	}
}

// ── Remote commands (uninstall etc.) ─────────────────────────────────────────

// executeUninstall finds the app in the Windows registry and runs its
// uninstaller silently.  MSI packages get /quiet /norestart; others get /S.
// The app name is passed via the DM_APP_NAME env var to avoid quoting issues.
func executeUninstall(appName string) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("uninstall only supported on Windows")
	}
	writeLog("uninstall: starting for " + appName)

	// Note: string concatenation (+) instead of backtick-escaping avoids
	// Go raw-string / PowerShell backtick conflicts.
	script :=
		`$n=$env:DM_APP_NAME;` +
		`$paths=@('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',` +
		`'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*');` +
		`$app=foreach($p in $paths){try{Get-ItemProperty $p -EA 0|?{$_.DisplayName -eq $n}}catch{}}|Select-Object -First 1;` +
		`if(!$app){Write-Error 'NOT_FOUND';exit 99}` +
		`$u=$app.UninstallString;` +
		`if($u -match 'msiexec'){` +
		`$g=$app.PSChildName;` +
		`$r=Start-Process msiexec.exe -ArgumentList ('/x '+$g+' /quiet /norestart') -Wait -PassThru;` +
		`exit $r.ExitCode` +
		`} else {` +
		`$r=Start-Process cmd.exe -ArgumentList ('/c '+$u+' /S') -Wait -PassThru;` +
		`if($r.ExitCode -ne 0){$r=Start-Process cmd.exe -ArgumentList ('/c '+$u) -Wait -PassThru};` +
		`exit $r.ExitCode` +
		`}`

	cmd := exec.Command(
		psExe(),
		"-ExecutionPolicy", "Bypass",
		"-NonInteractive", "-NoProfile",
		"-EncodedCommand", encodePS(script),
	)
	cmd.Env = append(os.Environ(), "DM_APP_NAME="+appName)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		se := stderr.String()
		if len(se) > 300 {
			se = se[:300]
		}
		writeLog(fmt.Sprintf("uninstall error (%s): %v — %s", appName, err, se))
		return fmt.Errorf("%v — %s", err, se)
	}
	writeLog("uninstall ok: " + appName)
	return nil
}

// reportCommand sends the result of a command back to the server.
// output is the captured stdout/stderr of a script (empty for non-script commands).
func reportCommand(token, commandID, status, output, errMsg string) {
	type Payload struct {
		ID     string `json:"id"`
		Token  string `json:"token"`
		Status string `json:"status"`
		Output string `json:"output,omitempty"`
		Error  string `json:"error,omitempty"`
	}
	p := Payload{ID: commandID, Token: token, Status: status, Output: output, Error: errMsg}
	body, _ := json.Marshal(p)
	req, _ := http.NewRequest("PATCH", API_URL+"/api/commands", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		writeLog("reportCommand failed: " + err.Error())
		return
	}
	resp.Body.Close()
}

// executeScript runs a PowerShell or CMD script and returns combined output.
// Output is capped at 60 KB to stay within API limits.
func executeScript(scriptType, content string) (string, error) {
	writeLog("script: executing type=" + scriptType)
	var cmd *exec.Cmd

	if scriptType == "cmd" {
		// Write a temp .bat file so we don't need to deal with cmd escaping
		tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("dm_%d.bat", time.Now().UnixNano()))
		_ = os.WriteFile(tmpFile, []byte("@echo off\r\n"+content), 0644)
		defer os.Remove(tmpFile)
		cmd = exec.Command("cmd.exe", "/c", tmpFile)
	} else {
		// PowerShell via -EncodedCommand
		cmd = exec.Command(
			psExe(),
			"-ExecutionPolicy", "Bypass",
			"-NonInteractive", "-NoProfile",
			"-EncodedCommand", encodePS(content),
		)
	}

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out // combine so user sees errors inline

	done := make(chan error, 1)
	go func() { done <- cmd.Run() }()

	const timeout = 120 * time.Second
	select {
	case err := <-done:
		output := out.String()
		if len(output) > 60000 {
			output = output[:60000] + "\n... (output truncated at 60 KB)"
		}
		if err != nil {
			writeLog(fmt.Sprintf("script: finished with error: %v", err))
			return output, err
		}
		writeLog(fmt.Sprintf("script: finished ok, %d bytes output", len(output)))
		return output, nil
	case <-time.After(timeout):
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		writeLog("script: timed out after 120s")
		return out.String() + "\n... (timed out after 120s)", fmt.Errorf("timeout after 120s")
	}
}

// processCommands runs any pending commands returned in the heartbeat response.
func processCommands(token string, cmds []PendingCommand) {
	for _, c := range cmds {
		writeLog(fmt.Sprintf("command: %s id=%s", c.Action, c.ID))
		switch c.Action {

		case "uninstall":
			if c.SoftwareName == "" {
				reportCommand(token, c.ID, "failed", "", "software_name is empty")
				continue
			}
			reportCommand(token, c.ID, "running", "", "")
			if err := executeUninstall(c.SoftwareName); err != nil {
				reportCommand(token, c.ID, "failed", "", err.Error())
			} else {
				reportCommand(token, c.ID, "done", "", "")
				_ = os.Remove(softwareTimestampPath()) // re-collect software list
			}

		case "run_script":
			if c.ScriptContent == "" {
				reportCommand(token, c.ID, "failed", "", "script_content is empty")
				continue
			}
			reportCommand(token, c.ID, "running", "", "")
			sType := c.ScriptType
			if sType == "" {
				sType = "powershell"
			}
			output, err := executeScript(sType, c.ScriptContent)
			if err != nil {
				reportCommand(token, c.ID, "failed", output, err.Error())
			} else {
				reportCommand(token, c.ID, "done", output, "")
			}

		default:
			reportCommand(token, c.ID, "failed", "", "unknown action: "+c.Action)
		}
	}
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────

type HeartbeatRequest struct {
	Action   string         `json:"action"`
	Token    string         `json:"token"`
	HW       HardwareInfo   `json:"hardware"`
	Software []SoftwareItem `json:"software,omitempty"` // included once per hour
	Version  int            `json:"version"`             // agent reports its current version
}

type PendingCommand struct {
	ID            string `json:"id"`
	Action        string `json:"action"`
	SoftwareName  string `json:"software_name"`
	ScriptContent string `json:"script_content"`
	ScriptType    string `json:"script_type"` // "powershell" | "cmd"
}

type HeartbeatResponse struct {
	OK              bool             `json:"ok"`
	UpdateAvailable bool             `json:"update_available"`
	DownloadURL     string           `json:"download_url"`
	Error           string           `json:"error"`
	PendingCommands []PendingCommand `json:"pending_commands"`
}

type PollTransfersRequest struct {
	Action string `json:"action"`
	Token  string `json:"token"`
}

type TransferItem struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	Data     string `json:"data"`
}

type PollTransfersResponse struct {
	Transfers []TransferItem `json:"transfers"`
}

type AckTransferRequest struct {
	Action     string `json:"action"`
	Token      string `json:"token"`
	TransferID string `json:"transfer_id"`
}

// ── Upload requests (device → dashboard) ─────────────────────────────────────

type PollUploadsRequest struct {
	Action string `json:"action"`
	Token  string `json:"token"`
}

type UploadRequest struct {
	ID       string `json:"id"`
	FilePath string `json:"file_path"`
}

type PollUploadsResponse struct {
	Requests []UploadRequest `json:"requests"`
}

type SubmitUploadRequest struct {
	Action     string `json:"action"`
	Token      string `json:"token"`
	RequestID  string `json:"request_id"`
	Filename   string `json:"filename,omitempty"`
	Data       string `json:"data,omitempty"`        // base64 file content
	BrowseJSON string `json:"browse_json,omitempty"` // JSON directory/drive listing
	Error      string `json:"error,omitempty"`
}

// BrowseItem is one entry in a directory listing
type BrowseItem struct {
	Name     string `json:"name"`
	IsDir    bool   `json:"is_dir"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

// BrowseDrive is one drive/partition
type BrowseDrive struct {
	Name   string `json:"name"`
	Fstype string `json:"fstype"`
	Total  uint64 `json:"total"`
	Free   uint64 `json:"free"`
	Used   uint64 `json:"used"`
}

func postJSON(path string, payload interface{}) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Post(API_URL+path, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func register(hw HardwareInfo) (*Config, error) {
	data, err := postJSON("/api/agent", RegisterRequest{Action: "register", HW: hw})
	if err != nil {
		return nil, err
	}
	var resp RegisterResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	if resp.Error != "" {
		return nil, fmt.Errorf("API error: %s", resp.Error)
	}
	return &Config{Token: resp.Token, DeviceID: resp.DeviceID}, nil
}

func heartbeat(token string, hw HardwareInfo, sw []SoftwareItem) (*HeartbeatResponse, error) {
	data, err := postJSON("/api/agent", HeartbeatRequest{
		Action:   "heartbeat",
		Token:    token,
		HW:       hw,
		Software: sw, // nil when not collecting (omitted from JSON)
		Version:  AGENT_VERSION,
	})
	if err != nil {
		return nil, err
	}
	var resp HeartbeatResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// processTransfers polls for pending file transfers and saves them locally
func processTransfers(token string) {
	data, err := postJSON("/api/agent", PollTransfersRequest{Action: "poll-transfers", Token: token})
	if err != nil {
		return
	}
	var resp PollTransfersResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return
	}
	if len(resp.Transfers) == 0 {
		return
	}

	dir := transferDir()
	os.MkdirAll(dir, 0755)

	for _, t := range resp.Transfers {
		b64 := t.Data
		if idx := strings.Index(b64, ","); idx != -1 {
			b64 = b64[idx+1:]
		}
		decoded, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			decoded, err = base64.URLEncoding.DecodeString(b64)
			if err != nil {
				continue
			}
		}
		dest := filepath.Join(dir, t.Filename)
		if err := os.WriteFile(dest, decoded, 0644); err != nil {
			continue
		}
		postJSON("/api/agent", AckTransferRequest{
			Action:     "ack-transfer",
			Token:      token,
			TransferID: t.ID,
		})
	}
}

// expandWinEnv expands Windows-style %VARNAME% environment variables in a path
func expandWinEnv(path string) string {
	result := path
	for {
		start := strings.Index(result, "%")
		if start == -1 {
			break
		}
		end := strings.Index(result[start+1:], "%")
		if end == -1 {
			break
		}
		end += start + 1
		varName := result[start+1 : end]
		varValue := os.Getenv(varName)
		result = result[:start] + varValue + result[end+1:]
	}
	return result
}

// diskUsageTimeout calls disk.Usage with a timeout so that slow or disconnected
// network drives (e.g. an unmapped share) don't freeze the whole agent process.
func diskUsageTimeout(mountpoint string, timeout time.Duration) (*disk.UsageStat, error) {
	type res struct {
		u   *disk.UsageStat
		err error
	}
	ch := make(chan res, 1)
	go func() {
		u, err := disk.Usage(mountpoint)
		ch <- res{u, err}
	}()
	select {
	case r := <-ch:
		return r.u, r.err
	case <-time.After(timeout):
		return nil, fmt.Errorf("timeout querying %s", mountpoint)
	}
}

// browseToJSON returns a JSON string for a directory or drives listing
func browseToJSON(expandedPath string) (browseJSON string, err error) {
	// ── Drives listing ───────────────────────────────────────────────────────
	if expandedPath == "" || strings.EqualFold(expandedPath, "drives:") {
		parts, _ := disk.Partitions(false)
		var drives []BrowseDrive
		for _, p := range parts {
			// 3-second per-drive timeout — skips network drives that are
			// mapped but unreachable, which would otherwise block for minutes.
			usage, err := diskUsageTimeout(p.Mountpoint, 3*time.Second)
			if err != nil {
				continue
			}
			drives = append(drives, BrowseDrive{
				Name:   p.Mountpoint,
				Fstype: p.Fstype,
				Total:  usage.Total,
				Free:   usage.Free,
				Used:   usage.Used,
			})
		}
		result := map[string]interface{}{"type": "drives", "drives": drives}
		b, _ := json.Marshal(result)
		return string(b), nil
	}

	// ── Directory listing (with 8-second overall timeout) ───────────────────
	type dirRes struct {
		items []BrowseItem
		err   error
	}
	dirCh := make(chan dirRes, 1)
	go func() {
		entries, err := os.ReadDir(expandedPath)
		if err != nil {
			dirCh <- dirRes{nil, err}
			return
		}
		var items []BrowseItem
		for _, entry := range entries {
			info, err := entry.Info()
			if err != nil {
				continue
			}
			items = append(items, BrowseItem{
				Name:     entry.Name(),
				IsDir:    entry.IsDir(),
				Size:     info.Size(),
				Modified: info.ModTime().UTC().Format(time.RFC3339),
			})
		}
		dirCh <- dirRes{items, nil}
	}()

	select {
	case r := <-dirCh:
		if r.err != nil {
			return "", r.err
		}
		result := map[string]interface{}{
			"type":  "directory",
			"path":  expandedPath,
			"items": r.items,
		}
		b, _ := json.Marshal(result)
		return string(b), nil
	case <-time.After(8 * time.Second):
		return "", fmt.Errorf("timeout listing directory %s (slow network path?)", expandedPath)
	}
}

// processUploads handles file browse + file collect requests from the dashboard
func processUploads(token string) {
	data, err := postJSON("/api/agent", PollUploadsRequest{Action: "poll-uploads", Token: token})
	if err != nil {
		return
	}
	var resp PollUploadsResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return
	}

	for _, req := range resp.Requests {
		expandedPath := expandWinEnv(req.FilePath)
		info, statErr := os.Stat(expandedPath)

		// ── Browse (empty path = drives, directory path = listing) ──────────
		if expandedPath == "" || strings.EqualFold(expandedPath, "drives:") ||
			(statErr == nil && info.IsDir()) {
			bjson, listErr := browseToJSON(expandedPath)
			if listErr != nil {
				postJSON("/api/agent", SubmitUploadRequest{
					Action: "submit-upload", Token: token, RequestID: req.ID,
					Error: fmt.Sprintf("Cannot list: %s", listErr.Error()),
				})
				continue
			}
			postJSON("/api/agent", SubmitUploadRequest{
				Action: "submit-upload", Token: token, RequestID: req.ID,
				BrowseJSON: bjson,
			})
			continue
		}

		// ── File not found ───────────────────────────────────────────────────
		if statErr != nil {
			postJSON("/api/agent", SubmitUploadRequest{
				Action: "submit-upload", Token: token, RequestID: req.ID,
				Error: fmt.Sprintf("Not found: %s", expandedPath),
			})
			continue
		}

		// ── File too large ───────────────────────────────────────────────────
		const maxBytes = 3 * 1024 * 1024
		if info.Size() > maxBytes {
			postJSON("/api/agent", SubmitUploadRequest{
				Action: "submit-upload", Token: token, RequestID: req.ID,
				Error: fmt.Sprintf("File too large (%s). Maximum 3 MB.", fmtSize(int(info.Size()))),
			})
			continue
		}

		// ── Read and return file ─────────────────────────────────────────────
		fileData, err := os.ReadFile(expandedPath)
		if err != nil {
			postJSON("/api/agent", SubmitUploadRequest{
				Action: "submit-upload", Token: token, RequestID: req.ID,
				Error: fmt.Sprintf("Cannot read: %s", err.Error()),
			})
			continue
		}
		postJSON("/api/agent", SubmitUploadRequest{
			Action:    "submit-upload",
			Token:     token,
			RequestID: req.ID,
			Filename:  filepath.Base(expandedPath),
			Data:      base64.StdEncoding.EncodeToString(fileData),
		})
	}
}

func fmtSize(b int) string {
	if b >= 1<<30 {
		return fmt.Sprintf("%.1f GB", float64(b)/(1<<30))
	}
	if b >= 1<<20 {
		return fmt.Sprintf("%.1f MB", float64(b)/(1<<20))
	}
	return fmt.Sprintf("%d KB", b>>10)
}

// ── Self-update ───────────────────────────────────────────────────────────────
// Downloads the new .exe, writes a batch script to swap it after we exit,
// then launches the batch and exits. Next scheduled-task run uses the new binary.
func selfUpdate(downloadURL string) {
	writeLog(fmt.Sprintf("selfUpdate: starting download from %s", downloadURL))
	dir := agentDir()
	os.MkdirAll(dir, 0755)

	newExe := filepath.Join(dir, "DeviceManagerAgent_update.exe")
	curExe := filepath.Join(dir, "DeviceManagerAgent.exe")

	// Download new binary
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Get(downloadURL)
	if err != nil {
		writeLog("selfUpdate: download failed: " + err.Error())
		return
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		writeLog("selfUpdate: read body failed: " + err.Error())
		return
	}
	if len(data) < 1024 {
		writeLog(fmt.Sprintf("selfUpdate: download suspiciously small (%d bytes), aborting", len(data)))
		return
	}
	if err := os.WriteFile(newExe, data, 0755); err != nil {
		writeLog("selfUpdate: write new exe failed: " + err.Error())
		return
	}
	writeLog(fmt.Sprintf("selfUpdate: downloaded %d bytes to %s", len(data), newExe))

	if runtime.GOOS == "windows" {
		// Batch: retry the move up to 10 times with 2s delays (exe may be locked briefly)
		bat := filepath.Join(dir, "update.bat")
		script := fmt.Sprintf(
			"@echo off\r\n"+
				"set NEW=\"%s\"\r\n"+
				"set CUR=\"%s\"\r\n"+
				"for /L %%%%i in (1,1,10) do (\r\n"+
				"  timeout /t 2 /nobreak > NUL\r\n"+
				"  move /y %%NEW%% %%CUR%% > NUL 2>&1\r\n"+
				"  if not errorlevel 1 goto :done\r\n"+
				")\r\n"+
				":done\r\n"+
				"del \"%%%%~f0\"\r\n",
			newExe, curExe,
		)
		if err := os.WriteFile(bat, []byte(script), 0755); err != nil {
			writeLog("selfUpdate: write bat failed: " + err.Error())
			return
		}
		writeLog("selfUpdate: launching update.bat and exiting")
		exec.Command("cmd", "/c", "start", "", "/min", bat).Start()
	} else {
		os.Rename(newExe, curExe)
	}

	os.Exit(0)
}

// ── Install ───────────────────────────────────────────────────────────────────

// installWithPowerShell registers a robust scheduled task using PowerShell.
// It creates TWO triggers:
//   1. AtStartup  — fires immediately on every system boot (no waiting)
//   2. Repetition — fires every 1 minute as an ongoing heartbeat
//
// Additional settings:
//   - StartWhenAvailable: if a trigger was missed (machine was off), run it on next boot
//   - RestartCount 3 / every 1 min: auto-restart up to 3 times if the heartbeat crashes
//   - MultipleInstances IgnoreNew: prevents overlapping runs
func installWithPowerShell(dest string) error {
	script := "$exe = '" + dest + "'\n" +
		"$act = New-ScheduledTaskAction -Execute $exe -Argument '--heartbeat'\n" +
		"$t1  = New-ScheduledTaskTrigger -AtStartup\n" +
		"$t2  = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration ([TimeSpan]::MaxValue)\n" +
		"$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew\n" +
		"$pri = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest\n" +
		"Register-ScheduledTask -TaskName 'DeviceManagerAgent' -Action $act -Trigger @($t1,$t2) -Settings $set -Principal $pri -Force | Out-Null\n"

	out, err := exec.Command("powershell",
		"-NonInteractive", "-NoProfile", "-Command", script,
	).CombinedOutput()
	if err != nil {
		return fmt.Errorf("powershell: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func installScheduledTask(exePath string) error {
	if runtime.GOOS != "windows" {
		fmt.Println("  [skip] Scheduled task only supported on Windows")
		return nil
	}

	destDir := agentDir()
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}
	dest := filepath.Join(destDir, "DeviceManagerAgent.exe")
	if exePath != dest {
		src, err := os.ReadFile(exePath)
		if err != nil {
			return err
		}
		if err := os.WriteFile(dest, src, 0755); err != nil {
			return err
		}
	}

	taskCmd := fmt.Sprintf(`"%s" --heartbeat`, dest)

	// ── Attempt 1: PowerShell (AtStartup + Repetition + StartWhenAvailable) ──
	if err := installWithPowerShell(dest); err == nil {
		fmt.Println("✓ Auto-reporting scheduled (SYSTEM, starts on boot + every 1 min)")
		return nil
	}

	// ── Attempt 2: SYSTEM-level schtasks (requires admin) ────────────────────
	err := exec.Command("schtasks",
		"/create", "/tn", "DeviceManagerAgent",
		"/tr", taskCmd,
		"/sc", "MINUTE", "/mo", "1",
		"/ru", "SYSTEM", "/rl", "HIGHEST", "/f",
	).Run()
	if err == nil {
		fmt.Println("✓ Auto-reporting scheduled (SYSTEM, every 1 min)")
		return nil
	}

	// ── Attempt 3: User-level schtasks (no admin needed) ─────────────────────
	err = exec.Command("schtasks",
		"/create", "/tn", "DeviceManagerAgent",
		"/tr", taskCmd,
		"/sc", "MINUTE", "/mo", "1", "/f",
	).Run()
	if err == nil {
		fmt.Println("✓ Auto-reporting scheduled (current user, every 1 min)")
		return nil
	}

	// ── Attempt 4: Startup folder (no admin, runs at each login) ─────────────
	startupDir := filepath.Join(
		os.Getenv("APPDATA"),
		"Microsoft", "Windows", "Start Menu", "Programs", "Startup",
	)
	if mkErr := os.MkdirAll(startupDir, 0755); mkErr == nil {
		batPath := filepath.Join(startupDir, "DeviceManagerAgent.bat")
		batContent := fmt.Sprintf("@echo off\r\nstart \"\" /min \"%s\" --heartbeat\r\n", dest)
		if writeErr := os.WriteFile(batPath, []byte(batContent), 0755); writeErr == nil {
			fmt.Println("✓ Auto-reporting on startup (runs at login — no admin access)")
			return nil
		}
	}

	return fmt.Errorf("could not register auto-reporting (try running as Administrator)")
}

func uninstall() {
	fmt.Println("Uninstalling Device Manager Agent...")
	if runtime.GOOS == "windows" {
		exec.Command("schtasks", "/delete", "/tn", "DeviceManagerAgent", "/f").Run()
		fmt.Println("✓ Scheduled task removed")
	}
	os.Remove(configPath())
	fmt.Println("✓ Config file removed")
	fmt.Println("Done.")
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	mode := ""
	if len(os.Args) > 1 {
		mode = os.Args[1]
	}

	switch mode {

	case "--uninstall":
		uninstall()

	// ── Heartbeat (silent, called by scheduled task every minute) ───────────
	case "--heartbeat":
		cfg, err := loadConfig()
		if err != nil {
			writeLog("heartbeat: loadConfig failed: " + err.Error())
			os.Exit(1)
		}
		writeLog(fmt.Sprintf("heartbeat: v%d starting", AGENT_VERSION))
		hw := collectHardware()

		// Collect installed software once per hour (nil otherwise — omitted from JSON)
		var sw []SoftwareItem
		if shouldCollectSoftware() {
			sw = collectInstalledSoftware()
			if len(sw) > 0 {
				markSoftwareCollected()
			}
		} else {
			writeLog("software: skipped (collected recently)")
		}

		hbResp, err := heartbeat(cfg.Token, hw, sw)
		if err != nil {
			os.Exit(1)
		}
		// Handle dashboard → device file transfers
		processTransfers(cfg.Token)
		// Handle device → dashboard file upload requests
		processUploads(cfg.Token)
		// Process any remote commands (e.g. uninstall)
		if len(hbResp.PendingCommands) > 0 {
			processCommands(cfg.Token, hbResp.PendingCommands)
		}
		// Self-update if API says a newer version is available
		if hbResp.UpdateAvailable && hbResp.DownloadURL != "" {
			selfUpdate(hbResp.DownloadURL)
		}

	// ── Install (double-clicked by user) ─────────────────────────────────────
	default:
		fmt.Println("╔═══════════════════════════════════════╗")
		fmt.Println("║     Device Manager Agent Installer    ║")
		fmt.Printf("║             Version %d                 ║\n", AGENT_VERSION)
		fmt.Println("╚═══════════════════════════════════════╝")
		fmt.Println()

		if cfg, err := loadConfig(); err == nil && cfg.Token != "" {
			fmt.Println("✓ Already registered. Running heartbeat update...")
			hw := collectHardware()
			// Always collect software when run interactively (re-install / manual run)
			sw := collectInstalledSoftware()
			if len(sw) > 0 {
				markSoftwareCollected()
				fmt.Printf("         Software      : %d apps detected\n", len(sw))
			}
			hbResp, err := heartbeat(cfg.Token, hw, sw)
			if err != nil {
				fmt.Println("✗ Heartbeat failed:", err)
			} else {
				fmt.Println("✓ Device data updated successfully.")
				if hbResp.UpdateAvailable {
					fmt.Println("⬆ New agent version available — updating...")
				}
			}
			processTransfers(cfg.Token)
			if hbResp, err := heartbeat(cfg.Token, hw, nil); err == nil && hbResp.UpdateAvailable && hbResp.DownloadURL != "" {
				selfUpdate(hbResp.DownloadURL)
			}
			fmt.Println("\nPress Enter to exit...")
			fmt.Scanln()
			return
		}

		fmt.Println("Step 1/3  Collecting device information...")
		hw := collectHardware()
		fmt.Printf("         Hostname      : %s\n", hw.Hostname)
		fmt.Printf("         OS            : %s %s\n", hw.OS, hw.OSVersion)
		fmt.Printf("         CPU           : %s (%d cores)\n", hw.CPUBrand, hw.CPUCores)
		fmt.Printf("         RAM           : %.1f GB\n", float64(hw.RAMTotal)/1073741824)
		if hw.SerialNumber != "" {
			fmt.Printf("         Serial Number : %s\n", hw.SerialNumber)
		}
		if len(hw.IPAddresses) > 0 {
			fmt.Printf("         IP Address    : %s\n", hw.IPAddresses[0])
		}

		fmt.Println()
		fmt.Println("Step 2/3  Registering with Device Manager...")
		cfg, err := register(hw)
		if err != nil {
			fmt.Println("✗ Registration failed:", err)
			fmt.Println("\nMake sure this machine can reach:", API_URL)
			fmt.Println("\nPress Enter to exit...")
			fmt.Scanln()
			os.Exit(1)
		}
		if err := saveConfig(cfg); err != nil {
			fmt.Println("✗ Could not save config:", err)
			fmt.Println("  Try running as Administrator.")
			fmt.Println("\nPress Enter to exit...")
			fmt.Scanln()
			os.Exit(1)
		}
		fmt.Println("✓ Device registered successfully")

		fmt.Println()
		fmt.Println("Step 3/3  Setting up auto-reporting (every 5 minutes)...")
		exePath, _ := os.Executable()
		if err := installScheduledTask(exePath); err != nil {
			fmt.Println("  ⚠ Could not create scheduled task:", err)
			fmt.Println("  Run as Administrator for auto-reporting.")
		} else {
			fmt.Println("✓ Auto-reporting scheduled")
		}

		fmt.Println()
		fmt.Println("═══════════════════════════════════════")
		fmt.Println("  Installation complete!")
		fmt.Println("  This device is now visible in the")
		fmt.Println("  Device Manager dashboard.")
		fmt.Printf("  Agent version: %d\n", AGENT_VERSION)
		fmt.Println("═══════════════════════════════════════")
		fmt.Println()
		fmt.Println("Press Enter to exit...")
		fmt.Scanln()
	}
}
