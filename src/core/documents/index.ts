// Translation layer over the fake firm's systems (data/firm). Firm data is reached only through here.
export { type Contract, MalformedContractError, type Paragraph, type Section } from "./contract";
export { ContractNotFoundError, type ContractReader, createFirmDocuments } from "./firm";
export { renderContractForPrompt } from "./render";
