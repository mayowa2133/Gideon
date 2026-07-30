import type { EditorialV2Presenter } from "./creatorEditorialV2";

export type AxiomPoseConfiguration = Pick<
  EditorialV2Presenter,
  "visible" | "placement" | "scale" | "gesture" | "framing" | "pose"
>;

const AXIOM_EDITORIAL_POSES: readonly AxiomPoseConfiguration[] = [
  { visible: true, placement: "full", scale: 0.58, gesture: "emphasis", framing: "intimate_closeup", pose: "emphasis" },
  { visible: true, placement: "bottom", scale: 0.42, gesture: "idle", framing: "waist_up", pose: "neutral" },
  { visible: true, placement: "left", scale: 0.46, gesture: "point_right", framing: "chest_up", pose: "point_right" },
  { visible: false, placement: "none", scale: 0, gesture: "none", framing: "none", pose: "none" },
  { visible: true, placement: "right", scale: 0.45, gesture: "point_left", framing: "chest_up", pose: "point_left" },
  { visible: false, placement: "none", scale: 0, gesture: "none", framing: "none", pose: "none" },
  { visible: true, placement: "full", scale: 0.54, gesture: "emphasis", framing: "intimate_closeup", pose: "emphasis" },
  { visible: true, placement: "left", scale: 0.44, gesture: "point_right", framing: "chest_up", pose: "point_right" },
  { visible: false, placement: "none", scale: 0, gesture: "none", framing: "none", pose: "none" },
  { visible: false, placement: "none", scale: 0, gesture: "none", framing: "none", pose: "none" },
  { visible: true, placement: "full", scale: 0.55, gesture: "emphasis", framing: "intimate_closeup", pose: "emphasis" },
  { visible: true, placement: "right", scale: 0.44, gesture: "point_left", framing: "chest_up", pose: "point_left" },
  { visible: true, placement: "bottom", scale: 0.40, gesture: "explain", framing: "waist_up", pose: "explain" },
  { visible: true, placement: "bottom", scale: 0.46, gesture: "explain", framing: "chest_up", pose: "explain" },
  { visible: true, placement: "full", scale: 0.56, gesture: "open_cta", framing: "intimate_closeup", pose: "open_cta" },
  { visible: false, placement: "none", scale: 0, gesture: "none", framing: "none", pose: "none" }
];

export function axiomEditorialPoseForShot(index: number): AxiomPoseConfiguration {
  const pose = AXIOM_EDITORIAL_POSES[index];
  if (!pose) throw new Error(`No Axiom editorial pose is defined for shot index ${index}.`);
  return { ...pose };
}

export function axiomEditorialPoseNames(): string[] {
  return [...new Set(AXIOM_EDITORIAL_POSES.filter(({ visible }) => visible).map(({ pose }) => pose))];
}
