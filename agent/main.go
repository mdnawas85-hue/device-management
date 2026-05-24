package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

// ── Config ────────────────────────────────────────────────────────────────────

// Baked-in API URL — change before building
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
	Hostname    string   `json:"hostname"`
	OS          string   `json:"os"`
	OSVersion   string   `json:"os_version"`
	OSBuild     string   `json:"os_build"`
	KernelArch  string   `json:"kernel_arch"`
	CPUBrand    string   `json:"cpu_brand"`
	CPUCores    int      `json:"cpu_cores"`
	CPUThreads  int      `json:"cpu_threads"`
	CPUUsage    float64  `json:"cpu_usage"`
	RAMTotal    uint64   `json:"ram_total"`
	RAMUsed     uint64   `json:"ram_used"`
	RAMFree     uint64   `json:"ram_free"`
	DiskTotal   uint64   `json:"disk_total"`
	DiskUsed    uint64   `json:"disk_used"`
	DiskFree    uint64   `json:"disk_free"`
	IPAddresses []string `json:"ip_addresses"`
	MACAddress  string   `json:"mac_address"`
	LoggedUser  string   `json:"logged_user"`
	Uptime      uint64   `json:"uptime"`
	BootTime    uint64   `json:"boot_time"`
	Platform    string   `json:"platform"`
}

func collectHardware() HardwareInfo {
	h := HardwareInfo{}

	// Host info
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

	// Users
	if users, err := host.Users(); err == nil && len(users) > 0 {
		h.LoggedUser = users[0].User
	}

	// CPU
	if cpuInfo, err := cpu.Info(); err == nil && len(cpuInfo) > 0 {
		h.CPUBrand   = cpuInfo[0].ModelName
		h.CPUCores   = int(cpuInfo[0].Cores)
		h.CPUThreads = len(cpuInfo)
	}
	if usage, err := cpu.Percent(500*time.Millisecond, false); err == nil && len(usage) > 0 {
		h.CPUUsage = round2(usage[0])
	}

	// Memory
	if memInfo, err := mem.VirtualMemory(); err == nil {
		h.RAMTotal = memInfo.Total
		h.RAMUsed  = memInfo.Used
		h.RAMFree  = memInfo.Available
	}

	// Disk (aggregate all physical drives on root/C:)
	parts, _ := disk.Partitions(false)
	for _, p := range parts {
		if u, err := disk.Usage(p.Mountpoint); err == nil {
			h.DiskTotal += u.Total
			h.DiskUsed  += u.Used
			h.DiskFree  += u.Free
		}
	}

	// Network
	ifaces, _ := net.Interfaces()
	var ips []string
	for _, iface := range ifaces {
		if iface.Name == "lo" || iface.Name == "lo0" {
			continue
		}
		if h.MACAddress == "" && iface.HardwareAddr != "" && iface.HardwareAddr != "00:00:00:00:00:00" {
			h.MACAddress = iface.HardwareAddr
		}
		for _, addr := range iface.Addrs {
			ip := addr.Addr
			if ip == "" || ip == "127.0.0.1" || ip == "::1" {
				continue
			}
			// Strip CIDR
			for i, c := range ip {
				if c == '/' {
					ip = ip[:i]
					break
				}
			}
			ips = append(ips, ip)
		}
	}
	h.IPAddresses = ips

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
	Action string       `json:"action"`
	Token  string       `json:"token"`
	HW     HardwareInfo `json:"hardware"`
}

func postJSON(path string, payload interface{}) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	resp, err := http.Post(API_URL+path, "application/json", bytes.NewReader(body))
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

func heartbeat(token string, hw HardwareInfo) error {
	_, err := postJSON("/api/agent", HeartbeatRequest{Action: "heartbeat", Token: token, HW: hw})
	return err
}

// ── Install (scheduled task setup) ───────────────────────────────────────────

func installScheduledTask(exePath string) error {
	if runtime.GOOS != "windows" {
		fmt.Println("  [skip] Scheduled task only supported on Windows")
		return nil
	}
	// Copy exe to ProgramData so the task path is stable
	destDir := filepath.Join(os.Getenv("PROGRAMDATA"), "DeviceManager")
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
	// Register scheduled task (runs every 5 min as SYSTEM)
	cmd := exec.Command("schtasks",
		"/create",
		"/tn", "DeviceManagerAgent",
		"/tr", fmt.Sprintf(`"%s" --heartbeat`, dest),
		"/sc", "MINUTE",
		"/mo", "5",
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

	// ── Uninstall ─────────────────────────────────────────────────────────────
	case "--uninstall":
		uninstall()

	// ── Heartbeat (silent, called by scheduled task) ──────────────────────────
	case "--heartbeat":
		cfg, err := loadConfig()
		if err != nil {
			os.Exit(1)
		}
		hw := collectHardware()
		if err := heartbeat(cfg.Token, hw); err != nil {
			os.Exit(1)
		}

	// ── Install (double-clicked by user) ─────────────────────────────────────
	default:
		fmt.Println("╔═══════════════════════════════════════╗")
		fmt.Println("║     Device Manager Agent Installer    ║")
		fmt.Println("╚═══════════════════════════════════════╝")
		fmt.Println()

		// Check if already installed
		if cfg, err := loadConfig(); err == nil && cfg.Token != "" {
			fmt.Println("✓ Already registered. Running heartbeat update...")
			hw := collectHardware()
			if err := heartbeat(cfg.Token, hw); err != nil {
				fmt.Println("✗ Heartbeat failed:", err)
			} else {
				fmt.Println("✓ Device data updated successfully.")
			}
			fmt.Println("\nPress Enter to exit...")
			fmt.Scanln()
			return
		}

		fmt.Println("Step 1/3  Collecting device information...")
		hw := collectHardware()
		fmt.Printf("         Hostname  : %s\n", hw.Hostname)
		fmt.Printf("         OS        : %s %s\n", hw.OS, hw.OSVersion)
		fmt.Printf("         CPU       : %s (%d cores)\n", hw.CPUBrand, hw.CPUCores)
		fmt.Printf("         RAM       : %.1f GB\n", float64(hw.RAMTotal)/1073741824)

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
			fmt.Println("  You can still run this file manually to update data.")
		} else {
			fmt.Println("✓ Auto-reporting scheduled")
		}

		fmt.Println()
		fmt.Println("═══════════════════════════════════════")
		fmt.Println("  Installation complete!")
		fmt.Println("  This device is now visible in the")
		fmt.Println("  Device Manager dashboard.")
		fmt.Println("═══════════════════════════════════════")
		fmt.Println()
		fmt.Println("Press Enter to exit...")
		fmt.Scanln()
	}
}
