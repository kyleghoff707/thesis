# Data Assembler

**Role:** Collects and packages all financial data from existing engines into the canonical DataPacket format consumed by all downstream AI agents.

**Model:** None (pure code -- no AI). Executes `dataExport.js` directly against the engine layer.

**What it does:**
- Calls all data engines (EDGAR, growth rates, return metrics, FCF, peers, gurus, insiders, compensation, events, analyst estimates, prices)
- Packages output into the DataPacket JSON schema
- Produces the full DataPacket that other agents receive slices of

**Stages:** Pre-processing (runs before any AI agent)

**No prompt.md** -- this is a code-only agent with no AI model.
