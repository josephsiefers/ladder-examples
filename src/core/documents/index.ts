// Translation layer over the fake firm's systems (data/firm). Firm data is reached only through here.
export { type Contract, MalformedContractError, type Paragraph, type Section } from "./contract";
export {
  ContractNotFoundError,
  type ContractReader,
  createFirmDocuments,
  type FirmDocuments,
} from "./firm";
export {
  type IntakeDesk,
  type IntakeDocument,
  IntakeNotFoundError,
  type IntakeParagraph,
  MalformedIntakeError,
  QUEUES,
  type Queue,
  type RoutingReceipt,
  type RoutingRecord,
  renderIntakeForPrompt,
} from "./intake";
export { renderContractForPrompt } from "./render";
