"use client";

import React from "react";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { ReportsWorkspace } from "@/components/ReportsWorkspace";

export default function PatientReportsPage() {
  return (
    <PatientGate>
      <ReportsWorkspace enablePerSectionNarrator={true} />
    </PatientGate>
  );
}
