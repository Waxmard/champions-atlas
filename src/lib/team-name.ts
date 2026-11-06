const possessivePattern = /^(.*?)(?:'s|’s|'|’)\s(\S[\s\S]*)$/;
const suffixPattern =
  /^(?:(?<placement>Champion|Runner[ -]Up|Top \d+|\d+(?:st|nd|rd|th)(?: & \d+(?:st|nd|rd|th))*)(?: Place)? )?(?<division>\([^()]+\) )?Team(?: (?<variant>V\d+))?(?: (?<qualifier>\([^()]+\)))?$/i;
const danglingWord = /(?:^|\s)(?:and|&|or|of|the|a|vs|versus)$/i;

export interface TeamNameParts {
  title: string;
  middle: string;
  placement: string;
  division: string;
}

export const withoutDivision = (text: string) =>
  text.replace(/ \([^()]*\)$/, '');

export function splitTeamName(name: string): TeamNameParts | null {
  const possessive = name.match(possessivePattern);
  const label = possessive?.[1].trim() ?? '';
  if (!possessive || !label) return null;
  const rest = possessive[2];
  for (let start = 0; start < rest.length; start++) {
    if (start && rest[start - 1] !== ' ') continue;
    const suffix = rest.slice(start).match(suffixPattern);
    if (!suffix) continue;
    const {
      placement = '',
      division = '',
      variant,
      qualifier,
    } = suffix.groups ?? {};
    if (/team/i.test(division) || /team/i.test(qualifier ?? '')) continue;
    const middle = rest.slice(0, start).trim();
    if (danglingWord.test(middle)) continue;
    return {
      title: [label, variant, qualifier].filter(Boolean).join(' '),
      middle,
      placement: placement.replace(/ Place$/i, ''),
      division: division.trim(),
    };
  }
  return null;
}
