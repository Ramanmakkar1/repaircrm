import { afterEach, expect, it, vi } from "vitest";
const mail = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), close: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: mail.create } }));
import { deliverSmtp } from "@/lib/comms/smtp";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("requires TLS, refuses file/URL attachments, and sets support replies", async () => {
  for (const [key,value] of Object.entries({SMTP_HOST:"smtp.hostinger.com",SMTP_USER:"noreply@example.com",SMTP_PASSWORD:"private-test-password",EMAIL_FROM:"noreply@example.com",EMAIL_REPLY_TO:"support@example.com"})) vi.stubEnv(key,value);
  mail.create.mockReturnValue({ sendMail: mail.send, close: mail.close });
  mail.send.mockResolvedValue({accepted:["owner@example.com"]});
  expect(await deliverSmtp({to:"owner@example.com",subject:"Test",text:"Test",html:"<p>Test</p>"})).toBe("sent");
  expect(mail.create).toHaveBeenCalledWith(expect.objectContaining({secure:true,port:465,disableFileAccess:true,disableUrlAccess:true,tls:{minVersion:"TLSv1.2",rejectUnauthorized:true}}));
  expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({replyTo:"support@example.com"}));
  expect(mail.close).toHaveBeenCalled();
});
it("fails closed when SMTP credentials are missing", async () => {
  vi.stubEnv("SMTP_PASSWORD","");
  expect(await deliverSmtp({to:"a@example.com",subject:"Test",text:"Test",html:"Test"})).toContain("failed:");
  expect(mail.create).not.toHaveBeenCalled();
});
