import { router } from "../../index";
import { importClients } from "./import-clients";

export { parseCsv } from "./parse-csv";
export { importClients } from "./import-clients";
export type { ImportClientsInput, ImportClientsResponse, ColumnMapping, ImportableClientField } from "./schemas";

export const importRouter = router({
  importClients,
});
