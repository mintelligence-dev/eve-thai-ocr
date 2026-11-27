import { defineState } from "eve/context";

import { emptyStore, type DocumentStore } from "./documents";

/** The documents read in this session, so corrections and exports work on the checked data. */
export const documents = defineState<DocumentStore>("thai-receipt.documents", emptyStore);
