export interface Device {
  id:           string;
  device_name:  string;
  device_type:  string;         // Laptop | Desktop | Phone | Tablet | Server | Printer | Network | Other
  brand:        string | null;
  model:        string | null;
  serial_number:string | null;
  mac_address:  string | null;
  ip_address:   string | null;
  os:           string | null;  // Windows | macOS | Linux | Android | iOS | Other
  os_version:   string | null;
  status:       string;         // Online | Offline | Maintenance | Retired
  assigned_to:  string | null;  // employee name
  department:   string | null;
  location:     string | null;
  purchase_date:string | null;
  warranty_end: string | null;
  notes:        string | null;
  created_at:   string;
  updated_at:   string;
}
