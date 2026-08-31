export interface ResourceVersion {
  url: string;
}

export interface ResourceConfig {
  current: string;
  versions: Record<string, ResourceVersion>;
}

export interface ResourceRegistry {
  resources: Record<string, ResourceConfig>;
}
