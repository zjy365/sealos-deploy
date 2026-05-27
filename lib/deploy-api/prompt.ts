import { prependSealosDeployContext } from '@/lib/sealos-deploy-context'

export function buildDeployPrompt(namespace?: string | null): string {
  return prependSealosDeployContext(
    `Deploy the repository in the current workspace.

Run the brain-github-deploy skill to completion:

/brain-github-deploy using the already-cloned repository in the current working directory.

Proceed automatically through all phases without stopping to ask for confirmation or input.

When complete, ensure these output files exist:
- .sealos/deployment-output.json
- .sealos/crossplane/ap.yaml

If anything fails, write .sealos/deployment-output.json with status "failed" and include an actionable error message in the "error" field.`,
    namespace,
  )
}
