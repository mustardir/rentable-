import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
try {
const body = await req.json();

const { email, password } = body;

if (!email || !password) {
  return NextResponse.json(
    {
      success: false,
      message: "Email and password are required",
    },
    { status: 400 }
  );
}

const user = await prisma.user.findUnique({
  where: {
    email: email.toLowerCase(),
  },
});

if (!user) {
  return NextResponse.json(
    {
      success: false,
      message: "Invalid credentials",
    },
    { status: 401 }
  );
}

const validPassword = await bcrypt.compare(
  password,
  user.passwordHash
);

if (!validPassword) {
  return NextResponse.json(
    {
      success: false,
      message: "Invalid credentials",
    },
    { status: 401 }
  );
}

return NextResponse.json({
  success: true,
  message: "Login successful",
  user: {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  },
});

} catch (error) {
console.error(error);

return NextResponse.json(
  {
    success: false,
    message: "Login failed",
  },
  { status: 500 }
);

}
}
