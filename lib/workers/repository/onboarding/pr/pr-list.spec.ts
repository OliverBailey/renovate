import type { RenovateConfig } from '~test/util.ts';
import { partial } from '~test/util.ts';
import type { BranchConfig } from '../../../types.ts';
import { getExpectedPrList, getExpectedPrListSummary } from './pr-list.ts';

describe('workers/repository/onboarding/pr/pr-list', () => {
  describe('getExpectedPrList()', () => {
    let config: RenovateConfig;

    beforeEach(() => {
      config = partial<RenovateConfig>({
        prHourlyLimit: 2, // default
      });
    });

    it('handles empty', () => {
      const branches: BranchConfig[] = [];
      const res = getExpectedPrList(config, branches);
      expect(res).toMatchInlineSnapshot(`
        "
        ### What to Expect

        It looks like your repository dependencies are already up-to-date and no Pull Requests will be necessary right away.
        "
      `);
    });

    it('has special lock file maintenance description', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Lock file maintenance',
          schedule: ['before 5am'],
          branchName: 'renovate/lock-file-maintenance',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              updateType: 'lockFileMaintenance',
              branchName: 'some-branch',
            },
          ],
        },
      ];
      const res = getExpectedPrList(config, branches);
      expect(res).toMatchInlineSnapshot(`
        "
        ### What to Expect

        With your current configuration, Renovate will create 1 Pull Request:

        <details>
        <summary>Lock file maintenance</summary>

          - Schedule: ["before 5am"]
          - Branch name: \`renovate/lock-file-maintenance\`
          - Merge into: \`base\`
          - Regenerate lock files to use latest dependency versions

        </details>

        "
      `);
    });

    it('handles multiple', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Pin dependencies',
          baseBranch: 'base',
          branchName: 'renovate/pin-dependencies',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              updateType: 'pin',
              sourceUrl: 'https://a',
              depName: 'a',
              depType: 'devDependencies',
              newValue: '1.1.0',
            },
            {
              manager: 'some-manager',
              updateType: 'pin',
              depName: 'b',
              newValue: '1.5.3',
            },
          ] as never,
        },
        {
          prTitle: 'Update a to v2',
          branchName: 'renovate/a-2.x',
          baseBranch: '', // handles case where baseBranch name is falsy
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              sourceUrl: 'https://a',
              depName: 'a',
              currentValue: '^1.0.0',
              depType: 'devDependencies',
              newValue: '2.0.1',
              isLockfileUpdate: true,
              branchName: 'some-branch',
            },
          ],
        },
      ];
      config.prHourlyLimit = 1;
      const res = getExpectedPrList(config, branches);
      expect(res).toMatchInlineSnapshot(`
        "
        ### What to Expect

        With your current configuration, Renovate will create 2 Pull Requests:

        <details>
        <summary>Pin dependencies</summary>

          - Branch name: \`renovate/pin-dependencies\`
          - Merge into: \`base\`
          - Pin [a](https://a) to \`1.1.0\`
          - Pin b to \`1.5.3\`


        </details>

        <details>
        <summary>Update a to v2</summary>

          - Branch name: \`renovate/a-2.x\`
          - Upgrade [a](https://a) to \`undefined\`


        </details>



        🚸 PR creation will be limited to maximum 1 per hour, so it doesn't swamp any CI resources or overwhelm the project. See [docs for \`prHourlyLimit\`](https://docs.renovatebot.com/configuration-options/#prhourlylimit) for details.

        "
      `);
    });

    it('shows commitHourlyLimit message when limit is low', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Update a to v1',
          branchName: 'renovate/a-1.x',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              depName: 'a',
              newValue: '1.0.0',
              branchName: 'some-branch',
            },
          ],
        },
        {
          prTitle: 'Update b to v1',
          branchName: 'renovate/b-1.x',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              depName: 'b',
              newValue: '1.0.0',
              branchName: 'some-branch',
            },
          ],
        },
      ];
      config.commitHourlyLimit = 1;
      const res = getExpectedPrList(config, branches);
      expect(res).toContain(
        'Branch creation and rebasing will be limited to maximum 1 per hour',
      );
      expect(res).toContain('commitHourlyLimit');
    });

    it('does not show commitHourlyLimit message when limit is high', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Update a to v1',
          branchName: 'renovate/a-1.x',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              depName: 'a',
              newValue: '1.0.0',
              branchName: 'some-branch',
            },
          ],
        },
      ];
      config.commitHourlyLimit = 10;
      const res = getExpectedPrList(config, branches);
      expect(res).not.toContain('commitHourlyLimit');
    });

    it('shows only commitHourlyLimit message when both limits are set', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Update a to v1',
          branchName: 'renovate/a-1.x',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              depName: 'a',
              newValue: '1.0.0',
              branchName: 'some-branch',
            },
          ],
        },
        {
          prTitle: 'Update b to v1',
          branchName: 'renovate/b-1.x',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              depName: 'b',
              newValue: '1.0.0',
              branchName: 'some-branch',
            },
          ],
        },
      ];
      config.prHourlyLimit = 1;
      config.commitHourlyLimit = 1;
      const res = getExpectedPrList(config, branches);
      expect(res).toContain('commitHourlyLimit');
      expect(res).not.toContain('prHourlyLimit');
    });
  });

  describe('getExpectedPrListSummary()', () => {
    let config: RenovateConfig;

    beforeEach(() => {
      config = partial<RenovateConfig>({
        prHourlyLimit: 2, // default
      });
    });

    it('handles empty', () => {
      const branches: BranchConfig[] = [];
      const res = getExpectedPrListSummary(config, branches);
      expect(res).toMatchInlineSnapshot(`
        "
        ### What to Expect

        It looks like your repository dependencies are already up-to-date and no Pull Requests will be necessary right away.
        "
      `);
    });

    it('handles different updateTypes', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Pin dependencies',
          baseBranch: '',
          branchName: 'renovate/pin-dependencies',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              updateType: 'pin',
              sourceUrl: 'https://a',
              depName: 'a',
              depType: 'devDependencies',
              newValue: '1.1.0',
            },
            {
              manager: 'some-manager',
              updateType: 'pin',
              depName: 'b',
              newValue: '1.5.3',
            },
          ] as never,
        },
        {
          prTitle: 'Update a to v2',
          branchName: 'renovate/a-2.x',
          baseBranch: '',
          manager: 'some-manager',
          upgrades: [
            {
              updateType: 'major',
              manager: 'some-manager',
              sourceUrl: 'https://a',
              depName: 'a',
              currentValue: '^1.0.0',
              depType: 'devDependencies',
              newValue: '2.0.1',
              isLockfileUpdate: true,
              branchName: 'some-branch',
            },
          ],
        },
        {
          prTitle: 'Replace node with nodejs',
          branchName: 'renovate/node-replacement',
          baseBranch: '',
          manager: 'dockerfile',
          upgrades: [
            {
              manager: 'dockerfile',
              updateType: 'replacement',
              depName: 'a',
              currentValue: '^1.0.0',
              branchName: 'renovate/node-replacement',
            },
          ],
        },
      ];

      const res = getExpectedPrListSummary(config, branches);

      expect(res).toMatchInlineSnapshot(`
        "
        ### What to Expect

        With your current configuration, Renovate will create 3 Pull Requests (1 major, 1 pin, 1 replacement):

        | Manager | major | pin | replacement |
        | ------- | ----- | ----- | ----------- |
        | some-manager | 1 | 1 | 0 |
        | dockerfile | 0 | 0 | 1 |
        🚸 PR creation will be limited to maximum 2 per hour, so it doesn't swamp any CI resources or overwhelm the project. See [docs for \`prHourlyLimit\`](https://docs.renovatebot.com/configuration-options/#prhourlylimit) for details.
        "
      `)
    })

    // TODO not security

    it('has special lock file maintenance description', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Lock file maintenance',
          schedule: ['before 5am'],
          branchName: 'renovate/lock-file-maintenance',
          baseBranch: 'base',
          manager: 'some-manager',
          packageFile: 'package.json',
          upgrades: [
            {
              manager: 'some-manager',
              updateType: 'lockFileMaintenance',
              branchName: 'some-branch',
            },
          ],
        },
      ];
      const res = getExpectedPrListSummary(config, branches);
      expect(res).toMatchInlineSnapshot(`
        "
        ### What to Expect

        With your current configuration, Renovate will create 1 Pull Request (1 lockFileMaintenance):

        | Manager | lockFileMaintenance |
        | ------- | ------------------- |
        | some-manager | 1 |
        "
      `);
    });

    it('includes the base branch if there are multiple being tracked', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Pin dependencies',
          baseBranch: 'base',
          branchName: 'renovate/pin-dependencies',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              updateType: 'pin',
              sourceUrl: 'https://a',
              depName: 'a',
              depType: 'devDependencies',
              newValue: '1.1.0',
            },
            {
              manager: 'some-manager',
              updateType: 'pin',
              depName: 'b',
              newValue: '1.5.3',
            },
          ] as never,
        },
        {
          prTitle: 'Update a to v2',
          branchName: 'renovate/a-2.x',
          baseBranch: '', // handles case where baseBranch name is falsy
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              sourceUrl: 'https://a',
              depName: 'a',
              currentValue: '^1.0.0',
              depType: 'devDependencies',
              newValue: '2.0.1',
              isLockfileUpdate: true,
              branchName: 'some-branch',
            },
          ],
        },
      ];

      const res = getExpectedPrListSummary(config, branches);

      expect(res).toMatchInlineSnapshot(`
        "
        ### What to Expect

        With your current configuration, Renovate will create 1 Pull Request to the default branch () and 1 Pull Request to the \`base\` branch (1 pin):

        | Branch | Manager | pin | lockfileUpdate |
        | --- | --- | --- | --- |
        | $default | some-manager | 0 | 1 |
        | base | some-manager | 1 | 0 |
        "
      `)
    })

    it('handles multiple', () => { // TODO name
      const branches: BranchConfig[] = [
        {
          prTitle: 'Pin dependencies',
          baseBranch: '',
          branchName: 'renovate/pin-dependencies',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              updateType: 'pin',
              sourceUrl: 'https://a',
              depName: 'a',
              depType: 'devDependencies',
              newValue: '1.1.0',
              branchName: 'some-branch',
            },
            {
              manager: 'some-manager',
              updateType: 'pin',
              depName: 'b',
              newValue: '1.5.3',
              branchName: 'some-branch',
            },
          ],
        },
        {
          prTitle: 'Update a to v2',
          branchName: 'renovate/a-2.x',
          baseBranch: '',
          manager: 'another-manager',
          upgrades: [
            {
              manager: 'some-manager',
              sourceUrl: 'https://a',
              depName: 'a',
              currentValue: '^1.0.0',
              depType: 'devDependencies',
              newValue: '2.0.1',
              isLockfileUpdate: true,
              branchName: 'some-branch',
            },
          ],
        },
      ];
      config.prHourlyLimit = 1;
      const res = getExpectedPrListSummary(config, branches);
      expect(res).toMatchInlineSnapshot(`
        "
        ### What to Expect

        With your current configuration, Renovate will create 2 Pull Requests (1 pin):

        | Manager | pin | lockfileUpdate |
        | ------- | ----- | -------------- |
        | some-manager | 1 | 0 |
        | another-manager | 0 | 1 |
        🚸 PR creation will be limited to maximum 1 per hour, so it doesn't swamp any CI resources or overwhelm the project. See [docs for \`prHourlyLimit\`](https://docs.renovatebot.com/configuration-options/#prhourlylimit) for details.
        "
      `);
    });

    it('todo', () => { // TODO name
      const branches: BranchConfig[] = [
        {
          prTitle: 'Pin dependencies',
          baseBranch: '',
          branchName: 'renovate/pin-dependencies',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              updateType: 'pin',
              depName: 'a',
              newValue: '1.1.0',
              branchName: 'renovate/pin-dependencies',
            },
            {
              manager: 'some-manager',
              updateType: 'pin',
              depName: 'b',
              newValue: '1.2.0',
              branchName: 'renovate/pin-dependencies',
            },
          ],
        },
        {
          prTitle: 'Update a to v2',
          branchName: 'renovate/a-2.x',
          baseBranch: '',
          manager: 'another-manager',
          upgrades: [
            {
              manager: 'some-manager',
              updateType: 'major',
              depName: 'a',
              newValue: '2.0.1',
              branchName: 'some-branch',
            },
          ],
        },
        {
          prTitle: 'Update a to 1.3.0',
          branchName: 'renovate/a-1.3',
          baseBranch: '',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              updateType: 'minor',
              depName: 'a',
              newValue: '1.3.0',
              branchName: 'some-branch',
            },
          ],
        },
        {
          prTitle: 'Update a to 1.1.1',
          branchName: 'renovate/a-1.1',
          baseBranch: '',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              updateType: 'patch',
              depName: 'a',
              newValue: '1.1.1',
              branchName: 'some-branch',
            },
          ],
        },
      ];
      config.prHourlyLimit = 1;
      const res = getExpectedPrListSummary(config, branches);
      expect(res).toMatchInlineSnapshot(`
        "
        ### What to Expect

        With your current configuration, Renovate will create 4 Pull Requests (1 major, 1 minor, 1 patch, 1 pin):

        | Manager | major | minor | patch | pin |
        | ------- | ----- | ----- | ----- | ----- |
        | some-manager | 0 | 1 | 1 | 1 |
        | another-manager | 1 | 0 | 0 | 0 |
        🚸 PR creation will be limited to maximum 1 per hour, so it doesn't swamp any CI resources or overwhelm the project. See [docs for \`prHourlyLimit\`](https://docs.renovatebot.com/configuration-options/#prhourlylimit) for details.
        "
      `);
    });


    describe('has special description when security update(s) exist', () => {
      it('and are split over multiple lines if there are multiple package files', () => {
        const branches: BranchConfig[] = [
          {
            prTitle: 'Update a to v2',
            branchName: 'renovate/a-2.x',
            baseBranch: '',
            manager: 'another-manager',
            packageFile: 'package.json',
            isVulnerabilityAlert: true,
            upgrades: [
              {
                manager: 'some-manager',
                updateType: 'major',
                depName: 'a',
                newValue: '2.0.1',
                branchName: 'some-branch',
              },
            ],
          },
          {
            prTitle: 'Update a to 1.3.0',
            branchName: 'renovate/a-1.3',
            baseBranch: '',
            manager: 'some-manager',
            packageFile: 'packages/examples/foo.json',
            isVulnerabilityAlert: true,
            upgrades: [
              {
                manager: 'some-manager',
                updateType: 'minor',
                depName: 'a',
                newValue: '1.3.0',
                branchName: 'some-branch',
              },
            ],
          },

          // multiple updates to the same file are grouped
          {
            prTitle: 'Update a to 1.1.1',
            branchName: 'renovate/a-1.1',
            baseBranch: '',
            manager: 'some-manager',
            isVulnerabilityAlert: true,
            packageFile: 'packages/examples/blah.json',
            upgrades: [
              {
                manager: 'some-manager',
                updateType: 'patch',
                depName: 'a',
                newValue: '1.1.1',
                branchName: 'some-branch',
              },
            ],
          },
          {
            prTitle: 'Update a to 1.1.1',
            branchName: 'renovate/a-1.1',
            baseBranch: '',
            manager: 'some-manager',
            isVulnerabilityAlert: true,
            packageFile: 'packages/examples/another.json',
            upgrades: [
              {
                manager: 'some-manager',
                updateType: 'patch',
                depName: 'a',
                newValue: '1.1.1',
                branchName: 'some-branch',
              },
            ],
          },
        ];
        const res = getExpectedPrListSummary(config, branches);
        expect(res).toMatchInlineSnapshot(`
          "
          ### What to Expect

          With your current configuration, Renovate will create 3 Pull Requests (3 security):

          | Manager | security |
          | ------- | -------- |
          | another-manager | 1 |
          | some-manager | 2 |

          **Security updates**:

          - \`a\`, (another-manager, major): \`package.json\`
          - \`a\`, (some-manager, minor): \`packages/examples/foo.json\`
          - \`a\`, (some-manager, patch):
            - \`packages/examples/blah.json\`
            - \`packages/examples/another.json\`
          🚸 PR creation will be limited to maximum 2 per hour, so it doesn't swamp any CI resources or overwhelm the project. See [docs for \`prHourlyLimit\`](https://docs.renovatebot.com/configuration-options/#prhourlylimit) for details.
          "
        `);
      });

      it('when the same package, is updated across different files with different managers', () => {
        const branches: BranchConfig[] = [
          {
            prTitle: 'Update c to 1.1.1',
            branchName: 'renovate/c-1.1',
            baseBranch: '',
            manager: 'pip_requirements',
            isVulnerabilityAlert: true,
            packageFile: 'requirements.txt',
            upgrades: [
              {
                manager: 'pip_requirements',
                updateType: 'patch',
                depName: 'c',
                newValue: '1.1.1',
                branchName: 'some-branch',
              },
            ],
          },
          {
            prTitle: 'Update c to 1.1.1',
            branchName: 'renovate/c-1.1',
            baseBranch: '',
            manager: 'pep621',
            isVulnerabilityAlert: true,
            packageFile: 'pyproject.toml',
            upgrades: [
              {
                manager: 'some-manager',
                updateType: 'patch',
                depName: 'a',
                newValue: '1.1.1',
                branchName: 'some-branch',
              },
            ],
          },
        ];
        const res = getExpectedPrListSummary(config, branches);
        expect(res).toMatchInlineSnapshot(`
          "
          ### What to Expect

          With your current configuration, Renovate will create 1 Pull Request (1 security):

          | Manager | security |
          | ------- | -------- |
          | pip_requirements | 1 |
          | pep621 | 1 |

          **Security updates**:

          - \`c\`, (patch):
            - \`requirements.txt\` (pip_requirements)
            - \`pyproject.toml\` (pep621)
          "
        `);
      })
    })

    it('shows commitHourlyLimit message when limit is low', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Update a to v1',
          branchName: 'renovate/a-1.x',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              depName: 'a',
              newValue: '1.0.0',
              branchName: 'some-branch',
            },
          ],
        },
        {
          prTitle: 'Update b to v1',
          branchName: 'renovate/b-1.x',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              depName: 'b',
              newValue: '1.0.0',
              branchName: 'some-branch',
            },
          ],
        },
      ];
      config.commitHourlyLimit = 1;
      const res = getExpectedPrListSummary(config, branches);
      expect(res).toContain(
        'Branch creation and rebasing will be limited to maximum 1 per hour',
      );
      expect(res).toContain('commitHourlyLimit');
    });

    it('does not show commitHourlyLimit message when limit is high', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Update a to v1',
          branchName: 'renovate/a-1.x',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              depName: 'a',
              newValue: '1.0.0',
              branchName: 'some-branch',
            },
          ],
        },
      ];
      config.commitHourlyLimit = 10;
      const res = getExpectedPrListSummary(config, branches);
      expect(res).not.toContain('commitHourlyLimit');
    });

    it('shows only commitHourlyLimit message when both limits are set', () => {
      const branches: BranchConfig[] = [
        {
          prTitle: 'Update a to v1',
          branchName: 'renovate/a-1.x',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              depName: 'a',
              newValue: '1.0.0',
              branchName: 'some-branch',
            },
          ],
        },
        {
          prTitle: 'Update b to v1',
          branchName: 'renovate/b-1.x',
          baseBranch: 'base',
          manager: 'some-manager',
          upgrades: [
            {
              manager: 'some-manager',
              depName: 'b',
              newValue: '1.0.0',
              branchName: 'some-branch',
            },
          ],
        },
      ];
      config.prHourlyLimit = 1;
      config.commitHourlyLimit = 1;
      const res = getExpectedPrListSummary(config, branches);
      expect(res).toContain('commitHourlyLimit');
      expect(res).not.toContain('prHourlyLimit');
    });
  });

});
