export interface HardwareInfo {
  hostname?:    string;
  os?:          string;
  os_version?:  string;
  os_build?:    string;
  kernel_arch?: string;
  cpu_brand?:   string;
  cpu_cores?:   number;
  cpu_threads?: number;
  cpu_usage?:   number;
  ram_total?:   number;
  ram_used?:    number;
  ram_free?:    number;
  disk_total?:  number;
  disk_used?:   number;
  disk_free?:   number;
  ip_addresses?:string[];
  mac_address?: string;
  logged_user?: string;
  uptime?:      number;
  boot_time?:   number;
  platform?:    string;
}

export interface Device {
  id:            string;
  device_name:   string;
  device_type:   string;
  brand:         string | null;
  model:         string | null;
  serial_number: string | null;
  mac_address:   string | null;
  ip_address:    string | null;
  os:            string | null;
  os_version:    string | null;
  status:        string;
  assigned_to:   string | null;
  department:    string | null;
  location:      string | null;
  purchase_date: string | null;
  warranty_end:  string | null;
  notes:         string | null;
  created_at:    string;
  updated_at:    string;
  // Agent fields
  agent_token?:  string;
  hostname?:     string;
  last_seen?:    string | null;
  hardware?:     HardwareInfo | null;
}
