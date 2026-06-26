import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
try {
const body = await req.json();

const {
  firstName,
  lastName,
  email,
  password,
} = body;

if (
  !firstName ||
  !lastName ||
  !email ||
  !password
) {
  return NextResponse.json(
    {
      success: false,
      message: "All fields are required",
    },
    { status: 400 }
  );
}

const existingUser = await prisma.user.findUnique({
  where: {
    email: email.toLowerCase(),
  },
});

if (existingUser) {
  return NextResponse.json(
    {
      success: false,
      message: "Email already registered",
    },
    { status: 409 }
  );
}

const passwordHash = await bcrypt.hash(
  password,
  12
);

const user = await prisma.user.create({
  data: {
    firstName,
    lastName,
    email: email.toLowerCase(),
    passwordHash,
  },
});

return NextResponse.json(
  {
    success: true,
    message: "Account created successfully",
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
  },
  { status: 201 }
);

} catch (error) {
console.error(error);

return NextResponse.json(
  {
    success: false,
    message: "Registration failed",
  },
  { status: 500 }
);

}
}
