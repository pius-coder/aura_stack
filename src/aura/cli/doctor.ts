import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type CheckStatus = "pass" | "warn" | "fail";

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  message: string;
}

const projectRoot = process.cwd();

const checks: DoctorCheck[] = [
  checkFile("Next.js proxy", "src/proxy.ts", "Next.js 16 transport checks are present."),
  checkFile(
    "Aura bridge route",
    "src/app/api/aura/[[...aura]]/route.ts",
    "Aura HTTP bridge is present.",
  ),
  checkFile("Aura registry", "src/aura.registry.ts", "Aura registry entrypoint is present."),
  checkFile("Prisma schema", "prisma/schema.prisma", "Prisma schema is present."),
  checkFile(
    "Generated Prisma client",
    "src/generated/prisma/client.ts",
    "Generated Prisma client is present.",
  ),
  checkFile("Aura client runtime", "src/aura/client/index.ts", "Client runtime is present."),
  checkFile("Aura auth operations", "src/aura/server/auth/operations.ts", "Auth operations are present."),
  checkEnv("DATABASE_URL", "Database connection URL is configured."),
  checkEnv("AURA_INTERNAL_SECRET", "Aura internal secret is configured.", {
    warnIfMissing: true,
  }),
  checkProductionOtpProvider(),
  checkPackageScript(),
  checkPrismaOutput(),
];

const hasFailures = checks.some((check) => check.status === "fail");

for (const check of checks) {
  const marker = check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "✗";
  console.log(`${marker} ${check.name}: ${check.message}`);
}

if (hasFailures) {
  console.error("\nAura doctor failed. Fix failing checks before deploying.");
  process.exitCode = 1;
} else {
  console.log("\nAura doctor completed.");
}

function checkFile(name: string, relativePath: string, okMessage: string): DoctorCheck {
  return existsSync(join(projectRoot, relativePath))
    ? { name, status: "pass", message: okMessage }
    : { name, status: "fail", message: `Missing ${relativePath}.` };
}

function checkEnv(
  name: string,
  okMessage: string,
  options: { warnIfMissing?: boolean } = {},
): DoctorCheck {
  if (process.env[name]) return { name, status: "pass", message: okMessage };

  return {
    name,
    status: options.warnIfMissing ? "warn" : "fail",
    message: `${name} is not set.`,
  };
}

function checkPackageScript(): DoctorCheck {
  const packageJsonPath = join(projectRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    return { name: "package.json", status: "fail", message: "package.json is missing." };
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  return packageJson.scripts?.["aura:doctor"]
    ? {
        name: "aura:doctor script",
        status: "pass",
        message: "package.json exposes aura:doctor.",
      }
    : {
        name: "aura:doctor script",
        status: "fail",
        message: "Add `aura:doctor` to package.json scripts.",
      };
}

function checkPrismaOutput(): DoctorCheck {
  const schemaPath = join(projectRoot, "prisma/schema.prisma");
  if (!existsSync(schemaPath)) {
    return { name: "Prisma output", status: "fail", message: "Prisma schema missing." };
  }

  const schema = readFileSync(schemaPath, "utf8");
  return schema.includes('provider = "prisma-client"') &&
    schema.includes('output   = "../src/generated/prisma"')
    ? {
        name: "Prisma output",
        status: "pass",
        message: "Prisma 7 client output matches Aura conventions.",
      }
    : {
        name: "Prisma output",
        status: "fail",
        message: "Prisma generator must use provider prisma-client and output ../src/generated/prisma.",
      };
}

function checkProductionOtpProvider(): DoctorCheck {
  if (process.env.NODE_ENV !== "production") {
    return {
      name: "OTP provider",
      status: "pass",
      message: "Development may use console OTP delivery.",
    };
  }

  if (process.env.AURA_OTP_WEBHOOK_URL || process.env.AURA_ALLOW_CONSOLE_OTP_IN_PROD === "true") {
    return {
      name: "OTP provider",
      status: process.env.AURA_ALLOW_CONSOLE_OTP_IN_PROD === "true" ? "warn" : "pass",
      message: process.env.AURA_ALLOW_CONSOLE_OTP_IN_PROD === "true"
        ? "Production console OTP override is enabled. Use only for controlled debugging."
        : "Production OTP webhook is configured.",
    };
  }

  return {
    name: "OTP provider",
    status: "fail",
    message: "Set AURA_OTP_WEBHOOK_URL or explicitly enable AURA_ALLOW_CONSOLE_OTP_IN_PROD.",
  };
}
