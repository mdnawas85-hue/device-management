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
const AGENT_VERSION = 5

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

type HeartbeatRequest struct {
	Action  string       `json:"action"`
	Token   string       `json:"token"`
	HW      HardwareInfo `json:"hardware"`
	Version int          `json:"version"` // agent reports its current version
}

type HeartbeatResponse struct {
	OK              bool   `json:"ok"`
	UpdateAvailable bool   `json:"update_available"`
	DownloadURL     string `json:"download_url"`
	Error           string `json:"error"`
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

func heartbeat(token string, hw HardwareInfo) (*HeartbeatResponse, error) {
	data, err := postJSON("/api/agent", HeartbeatRequest{
		Action:  "heartbeat",
		Token:   token,
		HW:      hw,
		Version: AGENT_VERSION,
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

// browseToJSON returns a JSON string for a directory or drives listing
func browseToJSON(expandedPath string) (browseJSON string, err error) {
	// ── Drives listing ───────────────────────────────────────────────────────
	if expandedPath == "" || strings.EqualFold(expandedPath, "drives:") {
		parts, _ := disk.Partitions(false)
		var drives []BrowseDrive
		for _, p := range parts {
			usage, err := disk.Usage(p.Mountpoint)
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

	// ── Directory listing ────────────────────────────────────────────────────
	entries, err := os.ReadDir(expandedPath)
	if err != nil {
		return "", err
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
	result := map[string]interface{}{
		"type":  "directory",
		"path":  expandedPath,
		"items": items,
	}
	b, _ := json.Marshal(result)
	return string(b), nil
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
	dir := agentDir()
	os.MkdirAll(dir, 0755)

	newExe := filepath.Join(dir, "DeviceManagerAgent_update.exe")
	curExe := filepath.Join(dir, "DeviceManagerAgent.exe")

	// Download new binary
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Get(downloadURL)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return
	}
	if err := os.WriteFile(newExe, data, 0755); err != nil {
		return
	}

	if runtime.GOOS == "windows" {
		// Batch script: wait 3s (so we can exit), swap exe, clean up
		bat := filepath.Join(dir, "update.bat")
		script := fmt.Sprintf(
			"@echo off\r\ntimeout /t 3 /nobreak > NUL\r\nmove /y \"%s\" \"%s\"\r\ndel \"%%~f0\"\r\n",
			newExe, curExe,
		)
		if err := os.WriteFile(bat, []byte(script), 0755); err != nil {
			return
		}
		// Launch batch detached so it survives after we exit
		exec.Command("cmd", "/c", "start", "", "/min", bat).Start()
	} else {
		// Non-Windows: just overwrite directly (not running from install path)
		os.Rename(newExe, curExe)
	}

	// Exit so the batch can overwrite us
	os.Exit(0)
}

// ── Install ───────────────────────────────────────────────────────────────────

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
	cmd := exec.Command("schtasks",
		"/create",
		"/tn", "DeviceManagerAgent",
		"/tr", fmt.Sprintf(`"%s" --heartbeat`, dest),
		"/sc", "MINUTE",
		"/mo", "1",
		"/ru", "SYSTEM",
		"/rl", "HIGHEST",
		"/f",
	)
	return cmd.Run()
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

	// ── Heartbeat (silent, called by scheduled task every 5 min) ─────────────
	case "--heartbeat":
		cfg, err := loadConfig()
		if err != nil {
			os.Exit(1)
		}
		hw := collectHardware()
		hbResp, err := heartbeat(cfg.Token, hw)
		if err != nil {
			os.Exit(1)
		}
		// Handle dashboard → device file transfers
		processTransfers(cfg.Token)
		// Handle device → dashboard file upload requests
		processUploads(cfg.Token)
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
			hbResp, err := heartbeat(cfg.Token, hw)
			if err != nil {
				fmt.Println("✗ Heartbeat failed:", err)
			} else {
				fmt.Println("✓ Device data updated successfully.")
				if hbResp.UpdateAvailable {
					fmt.Println("⬆ New agent version available — updating...")
				}
			}
			processTransfers(cfg.Token)
			if hbResp, err := heartbeat(cfg.Token, hw); err == nil && hbResp.UpdateAvailable && hbResp.DownloadURL != "" {
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
