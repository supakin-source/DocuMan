import { NextResponse } from "next/server";

import { requireUser } from "@/auth";
import { parseBody, toErrorResponse } from "@/lib/api";
import { ForbiddenError } from "@/lib/domain/errors";
import { updateUserProfile, userProfileSchema } from "@/lib/domain/users";
import { isAdmin } from "@/lib/roles";

export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/admin/users/[id]">,
) {
  try {
    const actor = await requireUser();
    if (!isAdmin(actor.roles)) {
      throw new ForbiddenError("เฉพาะผู้ดูแลระบบเท่านั้น");
    }

    const { id } = await params;
    const input = await parseBody(request, userProfileSchema);
    await updateUserProfile(id, actor.id, input);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
