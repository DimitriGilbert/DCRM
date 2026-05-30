import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import { user } from "./schema/index.js";

describe("auth schema", () => {
  it("enforces the single-user invariant with a database-level singleton guard", () => {
    const userColumns = getTableColumns(user);
    const userConfig = getTableConfig(user);
    const checkConstraintNames = userConfig.checks.map(checkConstraintName);

    assert.equal(userColumns.singleOwnerGuard.name, "single_owner_guard");
    assert.equal(userColumns.singleOwnerGuard.notNull, true);
    assert.equal(userColumns.singleOwnerGuard.default, true);
    assert.equal(userColumns.singleOwnerGuard.isUnique, true);
    assert.equal(userColumns.singleOwnerGuard.uniqueName, "user_single_owner_guard_unique");
    assert.ok(checkConstraintNames.includes("user_single_owner_guard_true"));
  });
});

function checkConstraintName(checkConstraint: object): string {
  if ("name" in checkConstraint && typeof checkConstraint.name === "string") {
    return checkConstraint.name;
  }
  return "";
}
