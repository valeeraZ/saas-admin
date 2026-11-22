import {
  ClipboardCheck,
  FileText,
  Layers,
  LayoutGrid,
  Package,
} from "lucide-react";

export const navigation = [
  {
    title: "workspace",
    items: [
      { key: "applications", icon: LayoutGrid },
      { key: "deployments", icon: Package },
      { key: "publications", icon: Layers },
    ],
  },
  {
    title: "governance",
    items: [
      { key: "requests", icon: ClipboardCheck },
      { key: "audit", icon: FileText },
    ],
  },
] as const;
