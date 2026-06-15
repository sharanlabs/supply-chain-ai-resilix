import { NextResponse } from "next/server";
import { operationsData } from "@/lib/data/operations";

export async function GET() {
  return NextResponse.json({ scenarios: operationsData.scenarios });
}
