import parse5 from 'parse5';
import { isPasteUrl, normalize } from '../src/lib/catalog.ts';
import { parsePaste } from '../src/lib/paste.ts';
import { setText } from '../src/lib/workbench.ts';

export const victoryRoadUrl = 'https://victoryroad.pro/champions-replica/';
export const devonCorpUrl =
  'https://devoncorp.press/resources/38-teams-for-pokemon-champions-regulation-m-a';

const vrHeaders = [
  'Flag',
  'Player',
  'Best results',
  'Team',
  'Code',
  'Paste',
  'Rep.',
];
const evStats = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

function errorWithReason(reason, message, details = {}) {
  const error = new Error(message || reason);
  error.code = reason;
  error.reason = reason;
  Object.assign(error, details);
  return error;
}

function walk(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
}

function descendants(node, predicate) {
  const found = [];
  walk(node, (child) => {
    if (predicate(child)) found.push(child);
  });
  return found;
}

function attr(node, name) {
  return node.attrs?.find((entry) => entry.name === name)?.value || '';
}

function text(node) {
  if (!node) return '';
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes || []).map(text).join('');
}

function cleanText(node) {
  return text(node).replace(/\s+/g, ' ').trim();
}

function textLines(node) {
  const lines = [''];
  const visit = (child) => {
    if (child.nodeName === '#text') {
      lines[lines.length - 1] += child.value;
      return;
    }
    if (child.tagName === 'br') {
      lines.push('');
      return;
    }
    for (const nested of child.childNodes || []) visit(nested);
  };
  visit(node);
  return lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function links(node) {
  return descendants(node, (child) => child.tagName === 'a').map((anchor) => ({
    href: attr(anchor, 'href'),
    label: cleanText(anchor),
  }));
}

function sourceHref(href, baseUrl) {
  if (!href) return '';
  try {
    const url = new URL(href, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : '';
  } catch {
    return '';
  }
}

function report(event, rank, sourceUrl) {
  return { event, rank, sourceUrl };
}

function uniqueReports(reports) {
  const seen = new Set();
  return reports.filter((entry) => {
    const key = JSON.stringify([entry.event, entry.rank, entry.sourceUrl]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalVictoryPaste(href) {
  let value = href;
  const trailingVrSlash =
    /^(https:\/\/(?:www\.)?vrpastes\.com\/[A-Za-z0-9]{8})\/$/.exec(value);
  if (trailingVrSlash) value = trailingVrSlash[1];
  const bareVr = /^https:\/\/vrpastes\.com\/([A-Za-z0-9]{8})$/.exec(value);
  if (bareVr) value = `https://www.vrpastes.com/${bareVr[1]}`;
  return isPasteUrl(value) ? value : '';
}

function parseRegulationHeading(value) {
  const normalized = value.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  return (
    /^Regulation Set (M-[A-Z])$/i.exec(normalized)?.[1].toUpperCase() || null
  );
}

function tableRows(table) {
  const rows = [];
  const visit = (node) => {
    for (const child of node.childNodes || []) {
      if (child.tagName === 'table') continue;
      if (child.tagName === 'tr') rows.push(child);
      else visit(child);
    }
  };
  visit(table);
  return rows;
}

function rowCells(row) {
  return (row.childNodes || []).filter(
    (child) => child.tagName === 'td' || child.tagName === 'th'
  );
}

function headerInfo(rows) {
  for (let index = 0; index < rows.length; index += 1) {
    const labels = rowCells(rows[index]).map(cleanText);
    const columns = new Map(
      labels.map((label, cellIndex) => [label, cellIndex])
    );
    if (vrHeaders.every((label) => columns.has(label))) {
      return { index, columns };
    }
  }
  return null;
}

function cellFor(cells, columns, name) {
  return cells[columns.get(name)] || null;
}

function playerName(cell) {
  return (
    descendants(
      cell,
      (node) => node.tagName === 'b' || node.tagName === 'strong'
    )
      .map(cleanText)
      .find(Boolean) || ''
  );
}

function speciesRoster(cell) {
  return descendants(cell, (node) => node.tagName === 'img')
    .map(
      (image) =>
        [attr(image, 'title').trim(), attr(image, 'alt').trim()].find(
          Boolean
        ) || ''
    )
    .filter(Boolean);
}

function boldBlocks(cell) {
  return descendants(
    cell,
    (node) => node.tagName === 'b' || node.tagName === 'strong'
  ).filter((node) => {
    for (
      let parent = node.parentNode;
      parent && parent !== cell;
      parent = parent.parentNode
    ) {
      if (parent.tagName === 'b' || parent.tagName === 'strong') return false;
    }
    return true;
  });
}

function normalizedRank(value) {
  const rank = value.trim();
  return rank.replace(/^(\d+(?:st|nd|rd|th))\s+Place$/i, '$1');
}

function addLinkedReports(reports, cell, baseUrl, usedUrls, fallbackEvent) {
  for (const link of links(cell)) {
    const sourceUrl = sourceHref(link.href, baseUrl);
    if (!sourceUrl || usedUrls.has(sourceUrl)) continue;
    reports.push(report(link.label || fallbackEvent, '', sourceUrl));
    usedUrls.add(sourceUrl);
  }
}

function sourcePageError(sourceName, reason, message, skipped = []) {
  return errorWithReason(reason, message, { sourceName, skipped });
}

export function parseVictoryRoad(html) {
  if (typeof html !== 'string')
    throw sourcePageError(
      'Victory Road',
      'invalid_source',
      'Victory Road HTML must be a string'
    );
  const document = parse5.parse(html);
  const allNodes = descendants(document, () => true);
  const headings = allNodes.filter((node) =>
    /^h[1-3]$/.test(node.tagName || '')
  );
  if (
    !headings.some(
      (node) =>
        node.tagName === 'h1' && /pok[eé]mon\s+champions/i.test(cleanText(node))
    )
  ) {
    throw sourcePageError(
      'Victory Road',
      'wrong_page',
      'Victory Road Champions heading was not found'
    );
  }

  const candidates = [];
  const skipped = [];
  let regulation = null;
  let section = '';
  let supportedTables = 0;
  for (const node of allNodes) {
    if (node.tagName === 'h2') {
      regulation = parseRegulationHeading(cleanText(node));
      section = '';
      continue;
    }
    if (node.tagName === 'h3') {
      section = cleanText(node);
      continue;
    }
    if (node.tagName !== 'table' || !regulation) continue;

    const rows = tableRows(node);
    const header = headerInfo(rows);
    if (!header) continue;
    supportedTables += 1;

    for (const row of rows.slice(header.index + 1)) {
      const cells = rowCells(row);
      if (
        !cells.length ||
        cells.every(
          (cell) =>
            !cleanText(cell) &&
            !descendants(cell, (n) => n.tagName === 'img' || n.tagName === 'a')
              .length
        )
      )
        continue;
      const pasteCell = cellFor(cells, header.columns, 'Paste');
      const pasteLink = links(pasteCell)[0];
      const rawPasteUrl = pasteLink?.href || '';
      if (!rawPasteUrl) {
        skipped.push({
          sourceUrl: victoryRoadUrl,
          pasteUrl: '',
          reason: 'missing_paste',
        });
        continue;
      }
      const pasteUrl = canonicalVictoryPaste(rawPasteUrl);
      if (!pasteUrl) {
        skipped.push({
          sourceUrl: victoryRoadUrl,
          pasteUrl: rawPasteUrl,
          reason: 'unsupported_paste_url',
        });
        continue;
      }

      const expectedSpecies = speciesRoster(
        cellFor(cells, header.columns, 'Team')
      );
      if (
        expectedSpecies.length !== 6 ||
        new Set(expectedSpecies.map(normalize)).size !== 6
      ) {
        skipped.push({
          sourceUrl: victoryRoadUrl,
          pasteUrl,
          reason: 'invalid_roster',
        });
        continue;
      }

      const creator = playerName(cellFor(cells, header.columns, 'Player'));
      const resultCell = cellFor(cells, header.columns, 'Best results');
      const resultLinks = links(resultCell)
        .map((link) => ({
          ...link,
          sourceUrl: sourceHref(link.href, victoryRoadUrl),
        }))
        .filter((link) => link.sourceUrl);
      const reports = [];
      const usedResultUrls = new Set();
      const resultEvents = [];
      for (const block of boldBlocks(resultCell)) {
        const [rawEvent = '', rawRank = ''] = textLines(block);
        if (!rawEvent) continue;
        const event = /ranked\s+battles/i.test(section)
          ? `Champions ranked battles — ${rawEvent}`
          : rawEvent;
        const rank = normalizedRank(rawRank);
        const link =
          links(block)
            .map((entry) => ({
              ...entry,
              sourceUrl: sourceHref(entry.href, victoryRoadUrl),
            }))
            .find((entry) => entry.sourceUrl) || resultLinks[0];
        reports.push(report(event, rank, link?.sourceUrl || victoryRoadUrl));
        resultEvents.push(event);
        if (link?.sourceUrl) usedResultUrls.add(link.sourceUrl);
      }
      reports.push(report('Victory Road collection', '', victoryRoadUrl));
      const creatorCell = cellFor(cells, header.columns, 'Player');
      const repCell = cellFor(cells, header.columns, 'Rep.');
      addLinkedReports(
        reports,
        creatorCell,
        victoryRoadUrl,
        usedResultUrls,
        'Creator profile'
      );
      addLinkedReports(
        reports,
        resultCell,
        victoryRoadUrl,
        usedResultUrls,
        'Victory Road report'
      );
      addLinkedReports(
        reports,
        repCell,
        victoryRoadUrl,
        usedResultUrls,
        'Victory Road report'
      );

      const event = resultEvents[0] || '';
      const replicaCode =
        cleanText(cellFor(cells, header.columns, 'Code')).replace(/\s+/g, '') ||
        null;
      candidates.push({
        sourceName: 'Victory Road',
        indexUrl: victoryRoadUrl,
        name: `${creator} — ${event || 'Victory Road team'}`,
        creator,
        regulation,
        pasteUrl,
        replicaCode,
        reports: uniqueReports(reports),
        expectedSpecies,
      });
    }
  }

  if (!supportedTables)
    throw sourcePageError(
      'Victory Road',
      'missing_structure',
      'Victory Road team table was not found',
      skipped
    );
  if (!candidates.length)
    throw sourcePageError(
      'Victory Road',
      'no_candidates',
      'Victory Road contained no usable teams',
      skipped
    );
  return { candidates, skipped };
}

function classHas(node, name) {
  return attr(node, 'class').split(/\s+/).includes(name);
}

function headingMatchesDevonTitle(node) {
  const value = cleanText(node);
  return /pok[eé]mon\s+champions/i.test(value) && /\bM-A\b/i.test(value);
}

function isUrlLabel(value) {
  return /^(?:https?:\/\/|www\.)/i.test(value.trim());
}

function xProfileHandle(href) {
  const value = sourceHref(href, devonCorpUrl);
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  if (
    !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(
      url.hostname.toLowerCase()
    )
  )
    return '';
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 1 || /^(?:i|intent|home|search)$/i.test(segments[0]))
    return '';
  let handle;
  try {
    handle = decodeURIComponent(segments[0]).replace(/^@/, '');
  } catch {
    return '';
  }
  return /^[A-Za-z0-9_]+$/.test(handle) ? handle : '';
}

function builderName(paragraph) {
  if (!paragraph) return '';
  const value = cleanText(paragraph)
    .replace(/^Teambuilder\s*:\s*/i, '')
    .trim();
  const anchors = links(paragraph);
  const labels = anchors.map((link) => link.label.trim()).filter(Boolean);
  const nonUrlLabel = labels.find((label) => !isUrlLabel(label));
  if (nonUrlLabel) return nonUrlLabel;
  const residual = value
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[()]/g, '')
    .trim();
  if (residual && !isUrlLabel(residual)) return residual;
  for (const link of anchors) {
    if (isUrlLabel(link.label) || !link.label) {
      const handle = xProfileHandle(link.href);
      if (handle) return handle;
    }
  }
  return '';
}

function paragraphLabel(paragraph, anchor) {
  const label = anchor.label.trim();
  if (label && !isUrlLabel(label)) return label;
  const paragraphText = cleanText(paragraph)
    .replace(/https?:\/\/\S+/gi, '')
    .trim();
  const prefix = /^([^:]+):/.exec(paragraphText)?.[1]?.trim();
  return prefix || paragraphText || 'Source';
}

function devonRows(blogContent) {
  const rows = [];
  let current = null;
  walk(blogContent, (node) => {
    if (node.tagName === 'h3') {
      current = { title: cleanText(node), blocks: [] };
      rows.push(current);
    } else if (
      current &&
      node.tagName === 'div' &&
      classHas(node, 'sqs-html-content')
    ) {
      current.blocks.push(node);
    }
  });
  return rows.filter((row) => row.title);
}

function rowParagraphs(row) {
  return row.blocks.flatMap((block) =>
    descendants(block, (node) => node.tagName === 'p')
  );
}

export function parseDevonCorp(html) {
  if (typeof html !== 'string')
    throw sourcePageError(
      'DevonCorp',
      'invalid_source',
      'DevonCorp HTML must be a string'
    );
  const document = parse5.parse(html);
  const articles = descendants(document, (node) => node.tagName === 'article');
  let article = null;
  let blogContent = null;
  const titleFound = descendants(document, (node) =>
    /^h[1-2]$/.test(node.tagName || '')
  ).some(headingMatchesDevonTitle);
  for (const candidateArticle of articles) {
    const contents = descendants(
      candidateArticle,
      (node) => node.tagName === 'div' && classHas(node, 'blog-item-content')
    );
    if (contents.length === 1) {
      article = candidateArticle;
      blogContent = contents[0];
      break;
    }
  }
  if (!titleFound)
    throw sourcePageError(
      'DevonCorp',
      'wrong_page',
      'DevonCorp Pokémon Champions M-A article title was not found'
    );
  if (!article || !blogContent)
    throw sourcePageError(
      'DevonCorp',
      'missing_structure',
      'DevonCorp article content was not found'
    );

  const rows = devonRows(blogContent);
  if (!rows.length)
    throw sourcePageError(
      'DevonCorp',
      'missing_structure',
      'DevonCorp team headings were not found'
    );
  const candidates = [];
  const skipped = [];
  for (const row of rows) {
    const paragraphs = rowParagraphs(row);
    const pasteParagraph = paragraphs.find((paragraph) =>
      /^Pokepaste\s*:/i.test(cleanText(paragraph))
    );
    const pasteLink = links(pasteParagraph).find((link) => link.href);
    const rawPasteUrl = pasteLink?.href || '';
    if (!rawPasteUrl) {
      skipped.push({
        sourceUrl: devonCorpUrl,
        pasteUrl: '',
        reason: 'missing_paste',
      });
      continue;
    }
    if (!isPasteUrl(rawPasteUrl)) {
      skipped.push({
        sourceUrl: devonCorpUrl,
        pasteUrl: rawPasteUrl,
        reason: 'unsupported_paste_url',
      });
      continue;
    }

    const builderParagraph = paragraphs.find((paragraph) =>
      /^Teambuilder\s*:/i.test(cleanText(paragraph))
    );
    const creator = builderName(builderParagraph);
    const codeParagraph = paragraphs.find((paragraph) =>
      /^Replica Code\s*:/i.test(cleanText(paragraph))
    );
    const replicaCode =
      cleanText(codeParagraph)
        .replace(/^Replica Code\s*:\s*/i, '')
        .trim() || null;
    const reports = [report('DevonCorp collection', '', devonCorpUrl)];
    for (const paragraph of paragraphs) {
      if (/^Pokepaste\s*:/i.test(cleanText(paragraph))) continue;
      for (const link of links(paragraph)) {
        const sourceUrl = sourceHref(link.href, devonCorpUrl);
        if (!sourceUrl || sourceUrl === rawPasteUrl) continue;
        const event = /^Teambuilder\s*:/i.test(cleanText(paragraph))
          ? 'Teambuilder'
          : paragraphLabel(paragraph, link);
        reports.push(report(event, '', sourceUrl));
      }
    }

    candidates.push({
      sourceName: 'DevonCorp',
      indexUrl: devonCorpUrl,
      name: row.title,
      creator,
      regulation: 'M-A',
      pasteUrl: rawPasteUrl,
      replicaCode,
      reports: uniqueReports(reports),
      expectedSpecies: null,
    });
  }

  if (!candidates.length)
    throw sourcePageError(
      'DevonCorp',
      'no_candidates',
      'DevonCorp contained no usable teams',
      skipped
    );
  return { candidates, skipped };
}

function invalidPayload(message) {
  throw errorWithReason(
    'invalid_payload',
    message || 'Invalid VR Pastes payload'
  );
}

function scalar(value, field, optional = true) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string') invalidPayload(`${field} must be a string`);
  if (/\r|\n/.test(value)) invalidPayload(`${field} contains a newline`);
  return value;
}

function publishedDate(value) {
  if (!Number.isSafeInteger(value) || value < 0) return '';
  const date = new Date(value * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

export function parseVrPaste(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    invalidPayload('VR Pastes response must be an object');
  if (data.hasPassword === true || data.is_encrypted === true)
    throw errorWithReason('protected_paste', 'VR Pastes payload is protected');

  let format = data.format;
  if (format === undefined || format === null || format === '') format = null;
  else if (typeof format !== 'string')
    invalidPayload('format must be a string');
  if (
    data.notes !== undefined &&
    data.notes !== null &&
    typeof data.notes !== 'string'
  )
    invalidPayload('notes must be a string');
  if (!Array.isArray(data.teams) || data.teams.length !== 6)
    invalidPayload('VR Pastes payload must contain six sets');

  const sets = data.teams.map((team, index) => {
    if (!team || typeof team !== 'object' || Array.isArray(team))
      invalidPayload(`set ${index + 1} must be an object`);
    const species = scalar(team.species, 'species', false);
    if (!species.trim()) invalidPayload('species must be nonempty');
    const name = scalar(team.name, 'name');
    const item = scalar(team.item, 'item');
    const ability = scalar(team.ability, 'ability');
    const nature = scalar(team.nature, 'nature');
    if (
      team.gender !== undefined &&
      team.gender !== null &&
      !['M', 'F', ''].includes(team.gender)
    )
      invalidPayload('gender must be M, F, empty, or null');
    if (team.shiny !== undefined && typeof team.shiny !== 'boolean')
      invalidPayload('shiny must be a boolean');
    let moves = [];
    if (team.moves !== undefined) {
      if (!Array.isArray(team.moves) || team.moves.length > 4)
        invalidPayload('moves must contain at most four strings');
      moves = team.moves.map((move) => {
        const value = scalar(move, 'move', false);
        if (!value.trim()) invalidPayload('moves must be nonempty strings');
        return value;
      });
    }

    let spread = null;
    if (team.evs !== undefined && team.evs !== null) {
      if (typeof team.evs !== 'object' || Array.isArray(team.evs))
        invalidPayload('evs must be an object');
      const entries = Object.entries(team.evs).map(([key, value]) => {
        if (!Object.hasOwn(evStats, key))
          invalidPayload(`unknown EV stat ${key}`);
        if (!Number.isInteger(value) || value < 0 || value > 252)
          invalidPayload(`invalid EV value for ${key}`);
        return `${value} ${evStats[key]}`;
      });
      spread = entries.join(' / ') || null;
    }

    const nickname =
      name && name !== species ? `${name} (${species})` : species;
    const pokemon = `${nickname}${team.gender ? ` (${team.gender})` : ''}`;
    let set = setText({
      pokemon,
      item: item || null,
      ability: ability || null,
      nature: nature || null,
      spread,
      moves,
    });
    if (team.shiny === true) set += '\nShiny: Yes';
    return set;
  });

  let paste;
  try {
    paste = sets.join('\n\n');
    parsePaste(paste);
  } catch (error) {
    throw errorWithReason('invalid_payload', error.message);
  }
  const notes =
    [data.notes || '', format ? `Format: ${format}` : '']
      .filter(Boolean)
      .join('\n') || null;
  return { paste, notes, publishedAt: publishedDate(data.createdAt), format };
}
