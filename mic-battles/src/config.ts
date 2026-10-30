// Configuration from the environment (.env.example documents every variable).

export type Config = {
  httpPort: number;
  natsUrl: string;
  natsUser: string;
  natsPassword: string;
};

export function loadConfig(): Config {
  return {
    httpPort: Number(process.env.HTTP_PORT ?? 8082),
    natsUrl: required("NATS_URL"),
    natsUser: required("NATS_USER"),
    natsPassword: required("NATS_PASSWORD"),
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
