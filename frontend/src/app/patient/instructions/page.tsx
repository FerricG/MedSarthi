"use client";

import React from "react";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { ConsultationViewer } from "@/app/patient/instructions/ConsultationViewer";

export default function PatientInstructionsPage() {
  return (
    <PatientGate>
      <ConsultationViewer />
    </PatientGate>
  );
}
