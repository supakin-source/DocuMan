import Image from "next/image";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { GoogleMark } from "@/components/icons";
import { PhoneFrame } from "@/components/phone-frame";

export const metadata = { title: "เข้าสู่ระบบ · DocuMan" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <PhoneFrame>
      <div className="relative flex flex-1 flex-col justify-center px-7 pt-12 pb-8">
        <div className="flex flex-col items-center gap-[18px]">
          <Image
            src="/brand/documan-logo.png"
            alt=""
            width={345}
            height={230}
            priority
            className="h-auto w-[345px] max-w-full"
          />
          <h1 className="-mt-11 mb-0 text-center text-[30px] text-accent">DocuMan</h1>
          <p className="m-0 text-center text-sm tracking-wide opacity-70">
            Document Management Solutions
          </p>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
            className="w-full"
          >
            <button
              type="submit"
              className="btn btn-primary btn-block mt-1.5 gap-2.5 p-3"
            >
              <GoogleMark />
              <span className="leading-none">ลงชื่อเข้าใช้ด้วย Google</span>
            </button>
          </form>
        </div>

        <footer className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-[3px]">
          <p className="m-0 text-center text-[10px] opacity-45">
            Copyright © 2026 Asset Five Development Co., Ltd. All rights reserved.
          </p>
          <p className="m-0 text-[10px] opacity-45">Version 0.1.0</p>
        </footer>
      </div>
    </PhoneFrame>
  );
}
