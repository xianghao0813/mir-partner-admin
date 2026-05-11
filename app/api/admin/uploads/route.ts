import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET_NAME = process.env.SUPABASE_POST_IMAGES_BUCKET || "post-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Image file is required." }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json(
      { message: "Only JPG, PNG, WEBP, or GIF images can be uploaded." },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { message: "Image must be 5MB or smaller." },
      { status: 400 }
    );
  }

  try {
    await ensureBucket();
  } catch (bucketError) {
    return NextResponse.json(
      {
        message: "Failed to prepare image storage.",
        error: bucketError instanceof Error ? bucketError.message : "Unknown storage error",
      },
      { status: 500 }
    );
  }

  const extension = getImageExtension(file);
  const filePath = `posts/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  const bytes = await file.arrayBuffer();

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(filePath, bytes, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    return NextResponse.json(
      { message: "Failed to upload image.", error: error.message },
      { status: 500 }
    );
  }

  const { data } = supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(filePath);
  return NextResponse.json({ url: data.publicUrl, path: filePath });
}

async function ensureBucket() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) {
    throw listError;
  }

  if (buckets?.some((bucket) => bucket.name === BUCKET_NAME)) {
    await supabaseAdmin.storage.updateBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: Array.from(ALLOWED_IMAGE_TYPES),
    });
    return;
  }

  const { error } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: Array.from(ALLOWED_IMAGE_TYPES),
  });

  if (error) {
    throw error;
  }
}

function getImageExtension(file: File) {
  const byType = file.type.split("/")[1];
  if (byType === "jpeg") return "jpg";
  if (byType) return byType;

  const byName = file.name.split(".").pop()?.toLowerCase();
  return byName || "jpg";
}
