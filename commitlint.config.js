module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci', 'build'],
    ],
    'scope-enum': [2, 'always', ['web', 'api', 'ios', 'shared', 'ui', 'docker', 'ci', 'deps']],
    'subject-case': [2, 'always', 'lower-case'],
  },
};
