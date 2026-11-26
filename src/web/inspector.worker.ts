import { blobSource } from "../formats/binary.ts";
import { type GameReport, inspectGame, toMarkdown } from "../formats/report.ts";

export interface InspectRequest {
  id: number;
  files: { path: string; file: Blob }[];
}
export type InspectResponse =
  | { id: number; ok: true; report: GameReport; markdown: string }
  | { id: number; ok: false; error: string };

self.onmessage = async ({ data }: MessageEvent<InspectRequest>) => {
  let response: InspectResponse;
  try {
    const report = await inspectGame(data.files.map((f) => ({ path: f.path, source: blobSource(f.file) })));
    response = { id: data.id, ok: true, report, markdown: toMarkdown(report) };
  } catch (error) {
    response = { id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
