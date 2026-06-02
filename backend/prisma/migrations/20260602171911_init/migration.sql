-- CreateTable
CREATE TABLE "generation_requests" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_results" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_results_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "generation_results" ADD CONSTRAINT "generation_results_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "generation_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
