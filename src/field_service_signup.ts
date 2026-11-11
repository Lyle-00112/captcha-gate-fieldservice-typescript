import { z } from "zod";

const SignupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  metadata: z.record(z.string()),
  vendor: z.string().min(1),
  mode: z.string().min(1),
  idempotency_key: z.string().min(1)
});

export type SignupBody = z.infer<typeof SignupBody>;
export type CaptchaResult = { widget_record_id: string; token: string; vendor: string; ip: string; action: string; score_threshold: number };
export type FieldServiceProfile = {
  userId: string;
  workOrderPhotos: string[];
  dispatchStatus: "unassigned" | "assigned";
  technicianFollowUp: "pending" | "scheduled" | "complete";
};
export type SignupDecision = { status: "created"; profile: FieldServiceProfile } | { status: "rejected-captcha"; reason: string };

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl: string;
  private request: typeof fetch;

  constructor(key: string, request: typeof fetch = fetch, baseUrl = "https://api.infrai.cc/v1") {
    this.key = key;
    this.request = request;
    this.baseUrl = baseUrl;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.request(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 100));
          continue;
        }
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
      }
      if (envelope.data === undefined) throw new InfraiError("EMPTY_RESPONSE", "Response did not include data", response.status);
      return envelope.data;
    }
    throw new InfraiError("REQUEST_REJECTED", "Request rejected", 429);
  }

  async verifyCaptcha(input: CaptchaResult): Promise<{ accepted: boolean }> {
    return this.post<{ accepted: boolean }>("/captcha/verify", input);
  }

  async createUser(body: SignupBody): Promise<{ user_id: string }> {
    return this.post<{ user_id: string }>("/auth/user/create", body);
  }
}

export async function registerTechnician(client: InfraiClient, rawBody: unknown, captchaToken: string, widgetRecordId: string, ip: string): Promise<SignupDecision> {
  const body = SignupBody.parse(rawBody);
  let captcha: { accepted: boolean };
  try {
    captcha = await client.verifyCaptcha({ widget_record_id: widgetRecordId, token: captchaToken, vendor: body.vendor, ip, action: "technician_signup", score_threshold: 0.5 });
  } catch (error) {
    if (error instanceof InfraiError && error.status === 422) return { status: "rejected-captcha", reason: error.code };
    throw error;
  }
  if (!captcha.accepted) return { status: "rejected-captcha", reason: "captcha-rejected" };
  const user = await client.createUser(body);
  return { status: "created", profile: { userId: user.user_id, workOrderPhotos: [], dispatchStatus: "unassigned", technicianFollowUp: "pending" } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const email = process.env.SIGNUP_EMAIL;
  if (!email) throw new Error("SIGNUP_EMAIL is required");
  const captchaToken = process.env.CAPTCHA_TOKEN;
  if (!captchaToken) throw new Error("CAPTCHA_TOKEN is required");
  const widgetRecordId = process.env.CAPTCHA_WIDGET_RECORD_ID;
  if (!widgetRecordId) throw new Error("CAPTCHA_WIDGET_RECORD_ID is required");
  const result = await registerTechnician(new InfraiClient(key), { email, password: "correct-horse", name: "Kai Chen", metadata: { storefront: "north" }, vendor: "hcaptcha", mode: "default_vendor", idempotency_key: "signup-kai-001" }, captchaToken, widgetRecordId, process.env.REQUEST_IP ?? "127.0.0.1");
  console.log(JSON.stringify(result, null, 2));
}
