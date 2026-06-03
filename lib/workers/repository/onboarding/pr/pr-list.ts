import {
  type RenovateConfig,
  UpdateTypesOptions,
} from '../../../../config/types.ts';
import { logger } from '../../../../logger/index.ts';
import { emojify } from '../../../../util/emoji.ts';
import { regEx } from '../../../../util/regex.ts';
import type { BranchConfig } from '../../../types.ts';

export function getExpectedPrList(
  config: RenovateConfig,
  branches: BranchConfig[],
): string {
  logger.debug('getExpectedPrList()');
  logger.trace({ config });
  let prDesc = `\n### What to Expect\n\n`;
  if (!branches.length) {
    return `${prDesc}It looks like your repository dependencies are already up-to-date and no Pull Requests will be necessary right away.\n`;
  }
  prDesc += `With your current configuration, Renovate will create ${branches.length} Pull Request`;
  prDesc += branches.length > 1 ? `s:\n\n` : `:\n\n`;

  for (const branch of branches) {
    const prTitleRe = regEx(/@([a-z]+\/[a-z]+)/);
    // TODO #22198
    prDesc += `<details>\n<summary>${branch.prTitle!.replace(
      prTitleRe,
      '@&#8203;$1',
    )}</summary>\n\n`;
    if (branch.schedule?.length) {
      prDesc += `  - Schedule: ${JSON.stringify(branch.schedule)}\n`;
    }
    prDesc += `  - Branch name: \`${branch.branchName}\`\n`;
    prDesc += branch.baseBranch
      ? `  - Merge into: \`${branch.baseBranch}\`\n`
      : '';
    const seen: string[] = [];
    for (const upgrade of branch.upgrades) {
      let text = '';
      if (upgrade.updateType === 'lockFileMaintenance') {
        text += '  - Regenerate lock files to use latest dependency versions';
      } else {
        if (upgrade.updateType === 'pin') {
          text += '  - Pin ';
        } else {
          text += '  - Upgrade ';
        }
        if (upgrade.sourceUrl) {
          // TODO: types (#22198)
          text += `[${upgrade.depName!}](${upgrade.sourceUrl})`;
        } else {
          text += upgrade.depName!.replace(prTitleRe, '@&#8203;$1');
        }
        // TODO: types (#22198)
        text += upgrade.isLockfileUpdate
          ? ` to \`${upgrade.newVersion!}\``
          : ` to \`${upgrade.newDigest ?? upgrade.newValue!}\``;
        text += '\n';
      }
      if (!seen.includes(text)) {
        prDesc += text;
        seen.push(text);
      }
    }
    prDesc += '\n\n';
    prDesc += '</details>\n\n';
  }
  // TODO: type (#22198)
  const prHourlyLimit = config.prHourlyLimit!;
  const commitHourlyLimit = config.commitHourlyLimit!;
  if (
    commitHourlyLimit > 0 &&
    commitHourlyLimit < 5 &&
    commitHourlyLimit < branches.length
  ) {
    prDesc += emojify(
      `\n\n:children_crossing: Branch creation and rebasing will be limited to maximum ${commitHourlyLimit} per hour, so it doesn't swamp any CI resources or overwhelm the project. See docs for \`commitHourlyLimit\` for details.\n\n`,
    );
  } else if (
    prHourlyLimit > 0 &&
    prHourlyLimit < 5 &&
    prHourlyLimit < branches.length
  ) {
    prDesc += emojify(
      `\n\n:children_crossing: PR creation will be limited to maximum ${prHourlyLimit} per hour, so it doesn't swamp any CI resources or overwhelm the project. See [docs for \`prHourlyLimit\`](https://docs.renovatebot.com/configuration-options/#prhourlylimit) for details.\n\n`,
    );
  }
  return prDesc;
}

const UPDATE_TYPE_DISPLAY_ORDER = [...UpdateTypesOptions];

function getBranchUpgradeTypes(branch: BranchConfig): Set<string> {
  if (branch.isVulnerabilityAlert) {
    return new Set(['security']);
  }
  const types = new Set<string>();
  for (const upgrade of branch.upgrades) {
    if (upgrade.updateType) {
      types.add(upgrade.updateType);
    } else if (upgrade.isLockfileUpdate) {
      types.add('lockfileUpdate');
    }
  }
  return types;
}

function getPrimaryType(types: Set<string>): string {
  if (types.has('security')) {
    return 'security';
  }
  for (const type of UPDATE_TYPE_DISPLAY_ORDER) {
    if (types.has(type)) {
      return type;
    }
  }
  return [...types][0] ?? 'other';
}

function formatTypeSummary(typeCount: Map<string, number>): string {
  const parts: string[] = [];
  // Note: 'security' is handled here separately because it's not in UPDATE_TYPE_DISPLAY_ORDER.
  for (const type of ['security', ...UPDATE_TYPE_DISPLAY_ORDER]) {
    const count = typeCount.get(type);
    if (count) {
      parts.push(`${count} ${type}`);
    }
  }
  return parts.join(', ');
}

// Sort: default branch (empty string) first, then named branches alphabetically.
function sortBaseBranches(bases: Iterable<string>): string[] {
  return [...bases].sort((a, b) => {
    if (a === '') {
      return -1;
    }
    if (b === '') {
      return 1;
    }
    return a.localeCompare(b);
  });
}

function describeSecurityGroup(groupBranches: BranchConfig[]): string {
  const firstUpgrade = groupBranches[0].upgrades[0];
  const depName = firstUpgrade?.depName ?? groupBranches[0].prTitle ?? '';
  const updateType = firstUpgrade?.updateType ?? 'unknown';
  const packageFiles = groupBranches
    .map((b) => ({ file: b.packageFile ?? '', manager: b.manager }))
    .filter((f) => f.file);
  const uniqueManagers = new Set(packageFiles.map((f) => f.manager));

  if (packageFiles.length <= 1) {
    const file = packageFiles[0]?.file ?? '';
    const manager = uniqueManagers.size === 1 ? [...uniqueManagers][0] : '';
    return `- \`${depName}\`, (${manager}, ${updateType}): \`${file}\`\n`;
  }

  if (uniqueManagers.size === 1) {
    const manager = [...uniqueManagers][0];
    const fileLines = packageFiles
      .map(({ file }) => `  - \`${file}\`\n`)
      .join('');
    return `- \`${depName}\`, (${manager}, ${updateType}):\n${fileLines}`;
  }

  const fileLines = packageFiles
    .map(({ file, manager }) => `  - \`${file}\` (${manager})\n`)
    .join('');
  return `- \`${depName}\`, (${updateType}):\n${fileLines}`;
}

interface BranchStats {
  // PR count per base branch, deduplicated by branchName.
  prCountByBase: Map<string, number>;
  // Primary-type count per base branch, deduplicated by branchName.
  typeCountByBase: Map<string, Map<string, number>>;
  // base -> manager -> type -> count, deduplicated by branchName+manager+type.
  tableStats: Map<string, Map<string, Map<string, number>>>;
  // All upgrade types seen anywhere — drives the table columns.
  presentTypes: Set<string>;
  // Security branches grouped by branchName.
  securityGroups: Map<string, BranchConfig[]>;
  prCount: number;
}

function collectBranchStats(branches: BranchConfig[]): BranchStats {
  const prCountByBase = new Map<string, number>();
  const typeCountByBase = new Map<string, Map<string, number>>();
  const tableStats = new Map<string, Map<string, Map<string, number>>>();
  const presentTypes = new Set<string>();
  const securityGroups = new Map<string, BranchConfig[]>();
  const seenPrs = new Set<string>();
  const seenTableKeys = new Set<string>();

  for (const branch of branches) {
    const base = branch.baseBranch ?? '';
    const { manager, branchName } = branch;
    const branchTypes = getBranchUpgradeTypes(branch);

    for (const type of branchTypes) {
      presentTypes.add(type);
    }

    if (!seenPrs.has(branchName)) {
      seenPrs.add(branchName);
      prCountByBase.set(base, (prCountByBase.get(base) ?? 0) + 1);
      if (!typeCountByBase.has(base)) {
        typeCountByBase.set(base, new Map());
      }
      const typeMap = typeCountByBase.get(base)!;
      const primaryType = getPrimaryType(branchTypes);
      typeMap.set(primaryType, (typeMap.get(primaryType) ?? 0) + 1);
    }

    if (!tableStats.has(base)) {
      tableStats.set(base, new Map());
    }
    const baseStats = tableStats.get(base)!;
    if (!baseStats.has(manager)) {
      baseStats.set(manager, new Map());
    }
    const managerStats = baseStats.get(manager)!;
    for (const type of branchTypes) {
      const key = `${branchName}:${manager}:${type}`;
      if (seenTableKeys.has(key)) {
        continue;
      }
      seenTableKeys.add(key);
      managerStats.set(type, (managerStats.get(type) ?? 0) + 1);
    }

    if (branch.isVulnerabilityAlert) {
      if (!securityGroups.has(branchName)) {
        securityGroups.set(branchName, []);
      }
      securityGroups.get(branchName)!.push(branch);
    }
  }

  return {
    prCountByBase,
    typeCountByBase,
    tableStats,
    presentTypes,
    securityGroups,
    prCount: seenPrs.size,
  };
}

function getTypeColumns(presentTypes: Set<string>): string[] {
  const cols: string[] = [];
  if (presentTypes.has('security')) {
    cols.push('security');
  }
  for (const t of UPDATE_TYPE_DISPLAY_ORDER) {
    if (presentTypes.has(t)) {
      cols.push(t);
    }
  }
  // Append any types not in the standard display order.
  for (const t of presentTypes) {
    if (!cols.includes(t)) {
      cols.push(t);
    }
  }
  return cols;
}

function typeSuffix(cols: string[]): string {
  return cols.length ? ` | ${cols.join(' | ')}` : '';
}

function renderRowCounts(
  typeColumns: string[],
  typeCounts: Map<string, number>,
): string {
  return typeSuffix(typeColumns.map((t) => String(typeCounts.get(t) ?? 0)));
}

function getRateLimitMessage(
  config: RenovateConfig,
  branches: BranchConfig[],
): string {
  // TODO #22198
  const prHourlyLimit = config.prHourlyLimit!;
  const commitHourlyLimit = config.commitHourlyLimit!;
  if (
    commitHourlyLimit > 0 &&
    commitHourlyLimit < 5 &&
    commitHourlyLimit < branches.length
  ) {
    return emojify(
      `:children_crossing: Branch creation and rebasing will be limited to maximum ${commitHourlyLimit} per hour, so it doesn't swamp any CI resources or overwhelm the project. See docs for \`commitHourlyLimit\` for details.\n`,
    );
  }
  if (
    prHourlyLimit > 0 &&
    prHourlyLimit < 5 &&
    prHourlyLimit < branches.length
  ) {
    return emojify(
      `:children_crossing: PR creation will be limited to maximum ${prHourlyLimit} per hour, so it doesn't swamp any CI resources or overwhelm the project. See [docs for \`prHourlyLimit\`](https://docs.renovatebot.com/configuration-options/#prhourlylimit) for details.\n`,
    );
  }
  return '';
}

export function getExpectedPrListSummary(
  config: RenovateConfig,
  branches: BranchConfig[],
): string {
  logger.debug('getExpectedPrListSummary()');
  logger.trace({ config });

  let prDesc = `\n### What to Expect\n\n`;

  if (!branches.length) {
    return `${prDesc}It looks like your repository dependencies are already up-to-date and no Pull Requests will be necessary right away.\n`;
  }

  const stats = collectBranchStats(branches);
  const sortedBases = sortBaseBranches(stats.prCountByBase.keys());
  const hasMultipleBaseBranches = sortedBases.length > 1;

  // Summary line
  if (hasMultipleBaseBranches) {
    const parts = sortedBases.map((base) => {
      const count = stats.prCountByBase.get(base)!;
      const typeSummary = formatTypeSummary(stats.typeCountByBase.get(base)!);
      const label = base ? `the \`${base}\` branch` : 'the default branch';
      return `${count} Pull Request${count > 1 ? 's' : ''} to ${label} (${typeSummary})`;
    });
    prDesc += `With your current configuration, Renovate will create ${parts.join(' and ')}:\n\n`;
  } else {
    const typeSummary = formatTypeSummary(
      stats.typeCountByBase.get(sortedBases[0])!,
    );
    prDesc += `With your current configuration, Renovate will create ${stats.prCount} Pull Request${stats.prCount > 1 ? 's' : ''} (${typeSummary}):\n\n`;
  }

  // Table
  const typeColumns = getTypeColumns(stats.presentTypes);
  if (hasMultipleBaseBranches) {
    prDesc += `| Branch | Manager${typeSuffix(typeColumns)} |\n`;
    prDesc += `| --- | ---${typeColumns.map(() => ' | ---').join('')} |\n`;
    for (const base of sortedBases) {
      const label = base || '$default';
      for (const [manager, typeCounts] of stats.tableStats.get(base)!) {
        prDesc += `| ${label} | ${manager}${renderRowCounts(typeColumns, typeCounts)} |\n`;
      }
    }
  } else {
    const separatorCells = typeColumns
      .map((c) => '-'.repeat(Math.max(c.length, 5)))
      .join(' | ');
    prDesc += `| Manager${typeSuffix(typeColumns)} |\n`;
    prDesc += `| ---${typeColumns.length ? ` | ${separatorCells}` : ''} |\n`;
    for (const [manager, typeCounts] of stats.tableStats.get(sortedBases[0])!) {
      prDesc += `| ${manager}${renderRowCounts(typeColumns, typeCounts)} |\n`;
    }
  }

  // Security updates section
  if (stats.securityGroups.size) {
    prDesc += `\n**Security updates**:\n\n`;
    for (const groupBranches of stats.securityGroups.values()) {
      prDesc += describeSecurityGroup(groupBranches);
    }
  }

  prDesc += `\n\n${getRateLimitMessage(config, branches)}`;

  return prDesc;
}
