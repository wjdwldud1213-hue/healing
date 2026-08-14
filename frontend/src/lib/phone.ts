// 숫자만 입력해도 타이핑하는 대로 자동으로 하이픈을 붙여준다.
// 짧은 내선번호(4자리 이하)는 하이픈 없이 그대로 두고, 휴대폰번호처럼 길어지면
// xxx-xxxx / xxx-xxx-xxxx / xxx-xxxx-xxxx(11자리) 형태로 맞춘다.
export function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
