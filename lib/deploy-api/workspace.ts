export function buildFindWorkspaceCommand(): string {
  return [
    'home_dir="${HOME:-/root}"',
    'if [ -d /home/devbox/workspace ]; then',
    '  workspace_dir="/home/devbox/workspace"',
    'elif [ -d "$home_dir/workspace" ]; then',
    '  workspace_dir="$home_dir/workspace"',
    'elif [ -d /workspace ]; then',
    '  workspace_dir="/workspace"',
    'else',
    '  workspace_dir="$home_dir"',
    'fi',
  ].join('\n')
}
