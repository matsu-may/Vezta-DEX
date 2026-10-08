const REVISION = /^[0-9a-f]{40}$/;

export function inspectGitlink(value) {
  if (!value || value.path !== "lib/v4-periphery" || value.submodule_git_url !== "https://github.com/Uniswap/v4-periphery" || !REVISION.test(value.sha ?? "")) {
    throw new Error("INVALID_GITLINK");
  }
  return value.sha;
}

// Evidence extraction only. It does not certify deployed ABI or executable calldata.
export function extractStructFields(source, name) {
  if (!/^(ExactInputSingleParams|ExactInputParams)$/.test(name) || typeof source !== "string") throw new Error("INVALID_SOURCE");
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const body = new RegExp(`\\bstruct\\s+${name}\\s*\\{([^}]*)\\}`).exec(clean)?.[1]?.trim();
  if (!body || !body.endsWith(";")) throw new Error("INVALID_SOURCE");
  const fields = body.slice(0, -1).split(";").map((field) => field.trim().replace(/\s+/g, " "));
  if (!fields.every((field) => /^[A-Za-z][A-Za-z0-9]*(?:\[\])? [A-Za-z][A-Za-z0-9]*$/.test(field))) throw new Error("INVALID_SOURCE");
  return fields;
}
