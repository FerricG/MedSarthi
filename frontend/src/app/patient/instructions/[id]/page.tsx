"use client";

import React from "react";
import { useParams } from "next/navigation";
import { PatientGate } from "@/app/patient/_components/PatientGate";
import { ConsultationViewer } from "@/app/patient/instructions/ConsultationViewer";

export default function PatientConsultationDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <PatientGate>
      <ConsultationViewer initialConsultationId={params?.id} />
    </PatientGate>
  );
}
