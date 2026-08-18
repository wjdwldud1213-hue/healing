// 숫자만 입력해도 타이핑하는 대로 자동으로 하이픈을 붙여준다.
// 짧은 내선번호(4자리 이하)는 하이픈 없이 그대로 두고, 휴대폰번호처럼 길어지면
// 자동으로 하이픈을 붙인다. 서울 지역번호(02)는 앞자리가 2자리라 xx-xxx-xxxx /
// xx-xxxx-xxxx로, 그 외(010, 031 등 3자리 국번)는 xxx-xxx-xxxx / xxx-xxxx-xxxx(11자리)로
// 자릿수 나누는 방식 자체가 다르다.
export function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  const isSeoul = digits.startsWith("02");
  const prefixLen = isSeoul ? 2 : 3;

  if (digits.length <= 4) return digits;
  if (digits.length <= prefixLen + 4) {
    return `${digits.slice(0, prefixLen)}-${digits.slice(prefixLen)}`;
  }
  if (digits.length <= prefixLen + 7) {
    return `${digits.slice(0, prefixLen)}-${digits.slice(prefixLen, prefixLen + 3)}-${digits.slice(prefixLen + 3)}`;
  }
  return `${digits.slice(0, prefixLen)}-${digits.slice(prefixLen, prefixLen + 4)}-${digits.slice(prefixLen + 4)}`;
}
