import base from "@smartdine/eslint-config/base";

export default [...base, { files: ["prisma/seed.ts"], rules: { "no-console": "off" } }];
