import type { RenovateConfig } from '../../../../config/types.ts';
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

const UPDATE_TYPE_DISPLAY_ORDER = [
  'major',
  'minor',
  'patch',
  'lockFileMaintenance',
  'lockfileUpdate',
  'pin',
  'digest',
  'pinDigest',
  'rollback',
  'bump',
  'replacement',
];

function getBranchPrimaryType(branch: BranchConfig): string {
  if (branch.isVulnerabilityAlert) return 'security';
  for (const type of UPDATE_TYPE_DISPLAY_ORDER) {
    if (branch.upgrades.some((u) => u.updateType === type)) return type;
  }
  if (branch.upgrades.some((u) => u.isLockfileUpdate)) return 'lockfileUpdate';
  return branch.upgrades[0]?.updateType ?? 'other';
}

function formatTypeSummary(typeCount: Map<string, number>): string {
  const parts: string[] = [];
  if (typeCount.get('security')) {
    parts.push(`${typeCount.get('security')} security`);
  }
  for (const type of UPDATE_TYPE_DISPLAY_ORDER) {
    const count = typeCount.get(type);
    if (count) {
      parts.push(`${count} ${type}`);
    }
  }
  return parts.join(', ');
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

  // Count unique PRs by branchName
  const uniqueBranchNames = new Set(branches.map((b) => b.branchName));
  const prCount = uniqueBranchNames.size;

  // Count PRs by type (using unique branchNames to avoid double-counting)
  const seenBranchNames = new Set<string>();
  const prTypeCount = new Map<string, number>();
  for (const branch of branches) {
    if (seenBranchNames.has(branch.branchName)) continue;
    seenBranchNames.add(branch.branchName);
    const type = getBranchPrimaryType(branch);
    prTypeCount.set(type, (prTypeCount.get(type) ?? 0) + 1);
  }

  // Determine if multiple base branches exist
  const baseBranchSet = new Set(branches.map((b) => b.baseBranch ?? ''));
  const hasMultipleBaseBranches = baseBranchSet.size > 1;

  if (hasMultipleBaseBranches) {
    // Group unique PRs by baseBranch
    const baseBranchPrCount = new Map<string, number>();
    const baseBranchTypeCount = new Map<string, Map<string, number>>();
    const seenForBase = new Set<string>();

    for (const branch of branches) {
      if (seenForBase.has(branch.branchName)) continue;
      seenForBase.add(branch.branchName);
      const base = branch.baseBranch ?? '';
      const type = getBranchPrimaryType(branch);
      baseBranchPrCount.set(base, (baseBranchPrCount.get(base) ?? 0) + 1);
      if (!baseBranchTypeCount.has(base)) {
        baseBranchTypeCount.set(base, new Map());
      }
      const typeMap = baseBranchTypeCount.get(base)!;
      typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
    }

    // Sort: default branch (empty string) first, then named branches alphabetically
    const sortedBases = [...baseBranchPrCount.keys()].sort((a, b) => {
      if (a === '') return -1;
      if (b === '') return 1;
      return a.localeCompare(b);
    });

    const parts: string[] = [];
    for (const base of sortedBases) {
      const count = baseBranchPrCount.get(base)!;
      const typeMap = baseBranchTypeCount.get(base)!;
      const typeSummary = formatTypeSummary(typeMap);
      const branchLabel = base
        ? `the \`${base}\` branch`
        : 'the default branch';
      parts.push(
        `${count} Pull Request${count > 1 ? 's' : ''} to ${branchLabel} (${typeSummary})`,
      );
    }
    prDesc += `With your current configuration, Renovate will create ${parts.join(' and ')}:\n\n`;
  } else {
    const typeSummary = formatTypeSummary(prTypeCount);
    prDesc += `With your current configuration, Renovate will create ${prCount} Pull Request${prCount > 1 ? 's' : ''} (${typeSummary}):\n\n`;
  }

  // Determine which non-security update types appear in the data
  const nonSecurityTypes = new Set<string>();
  for (const branch of branches) {
    if (!branch.isVulnerabilityAlert) {
      nonSecurityTypes.add(getBranchPrimaryType(branch));
    }
  }
  const typeColumns: string[] = UPDATE_TYPE_DISPLAY_ORDER.filter((t) =>
    nonSecurityTypes.has(t),
  );
  // Add any types not in the standard display order
  for (const t of nonSecurityTypes) {
    if (!typeColumns.includes(t)) {
      typeColumns.push(t);
    }
  }

  // Build table grouped by manager (and optionally base branch)

  const typeSuffix = (cols: string[]): string =>
    cols.length ? ` | ${cols.join(' | ')}` : '';
  const typeSeparatorSuffix = (cols: string[]): string =>
    cols.length
      ? ` | ${cols.map((c) => '-'.repeat(Math.max(c.length, 5))).join(' | ')}`
      : '';

  if (hasMultipleBaseBranches) {
    prDesc += `| Branch | Manager | security${typeSuffix(typeColumns)} |\n`;
    prDesc += `| --- | --- | ---${typeColumns.map(() => ' | ---').join('')} |\n`;

    // stats: baseBranch -> manager -> type -> count
    const stats = new Map<string, Map<string, Map<string, number>>>();
    for (const branch of branches) {
      const base = branch.baseBranch ?? '';
      const manager = branch.manager;
      const type = getBranchPrimaryType(branch);
      if (!stats.has(base)) stats.set(base, new Map());
      const baseStats = stats.get(base)!;
      if (!baseStats.has(manager)) baseStats.set(manager, new Map());
      const managerStats = baseStats.get(manager)!;
      managerStats.set(type, (managerStats.get(type) ?? 0) + 1);
    }

    // Sort: default branch first, then named branches alphabetically
    const sortedBases = [...stats.keys()].sort((a, b) => {
      if (a === '') return -1;
      if (b === '') return 1;
      return a.localeCompare(b);
    });

    for (const base of sortedBases) {
      const branchLabel = base || '$default';
      for (const [manager, typeCounts] of stats.get(base)!) {
        const securityCount = typeCounts.get('security') ?? 0;
        const rowSuffix = typeSuffix(
          typeColumns.map((t) => String(typeCounts.get(t) ?? 0)),
        );
        prDesc += `| ${branchLabel} | ${manager} | ${securityCount}${rowSuffix} |\n`;
      }
    }
  } else {
    prDesc += `| Manager | security${typeSuffix(typeColumns)} |\n`;
    prDesc += `| ------- | --------${typeSeparatorSuffix(typeColumns)} |\n`;

    // stats: manager -> type -> count
    const stats = new Map<string, Map<string, number>>();
    for (const branch of branches) {
      const manager = branch.manager;
      const type = getBranchPrimaryType(branch);
      if (!stats.has(manager)) stats.set(manager, new Map());
      const managerStats = stats.get(manager)!;
      managerStats.set(type, (managerStats.get(type) ?? 0) + 1);
    }

    for (const [manager, typeCounts] of stats) {
      const securityCount = typeCounts.get('security') ?? 0;
      const rowSuffix = typeSuffix(
        typeColumns.map((t) => String(typeCounts.get(t) ?? 0)),
      );
      prDesc += `| ${manager} | ${securityCount}${rowSuffix} |\n`;
    }
  }

  // Security updates section
  const securityBranches = branches.filter((b) => b.isVulnerabilityAlert);
  if (securityBranches.length) {
    prDesc += `\n**Security updates**:\n\n`;
    // Group by branchName
    const branchGroups = new Map<string, BranchConfig[]>();
    for (const branch of securityBranches) {
      if (!branchGroups.has(branch.branchName)) {
        branchGroups.set(branch.branchName, []);
      }
      branchGroups.get(branch.branchName)!.push(branch);
    }

    for (const [, groupBranches] of branchGroups) {
      const firstUpgrade = groupBranches[0].upgrades[0];
      const depName = firstUpgrade?.depName ?? groupBranches[0].prTitle ?? '';
      const updateType = firstUpgrade?.updateType ?? 'unknown';
      const packageFiles = groupBranches
        .map((b) => ({ file: b.packageFile ?? '', manager: b.manager }))
        .filter((f) => f.file);
      const uniqueManagers = new Set(packageFiles.map((f) => f.manager));

      if (packageFiles.length <= 1) {
        const file = packageFiles[0]?.file ?? '';
        const manager =
          uniqueManagers.size === 1 ? [...uniqueManagers][0] : '';
        prDesc += `- \`${depName}\`, (${manager}, ${updateType}): \`${file}\`\n`;
      } else if (uniqueManagers.size === 1) {
        const manager = [...uniqueManagers][0];
        prDesc += `- \`${depName}\`, (${manager}, ${updateType}):\n`;
        for (const { file } of packageFiles) {
          prDesc += `  - \`${file}\`\n`;
        }
      } else {
        prDesc += `- \`${depName}\`, (${updateType}):\n`;
        for (const { file, manager } of packageFiles) {
          prDesc += `  - \`${file}\` (${manager})\n`;
        }
      }
    }
  }

  // Rate limiting messages
  const prHourlyLimit = config.prHourlyLimit!;
  const commitHourlyLimit = config.commitHourlyLimit!;
  if (
    commitHourlyLimit > 0 &&
    commitHourlyLimit < 5 &&
    commitHourlyLimit < branches.length
  ) {
    prDesc += emojify(
      `\n:children_crossing: Branch creation and rebasing will be limited to maximum ${commitHourlyLimit} per hour, so it doesn't swamp any CI resources or overwhelm the project. See docs for \`commitHourlyLimit\` for details.\n`,
    );
  } else if (
    prHourlyLimit > 0 &&
    prHourlyLimit < 5 &&
    prHourlyLimit < branches.length
  ) {
    prDesc += emojify(
      `:children_crossing: PR creation will be limited to maximum ${prHourlyLimit} per hour, so it doesn't swamp any CI resources or overwhelm the project. See [docs for \`prHourlyLimit\`](https://docs.renovatebot.com/configuration-options/#prhourlylimit) for details.\n`,
    );
  }

  return prDesc;
}
