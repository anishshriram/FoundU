-- CreateTable
CREATE TABLE "match_pools" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "candidates" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_pools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_pools_user_id_key" ON "match_pools"("user_id");

-- AddForeignKey
ALTER TABLE "match_pools" ADD CONSTRAINT "match_pools_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HNSW index for fast approximate cosine similarity on embedding vectors (ADR-007)
CREATE INDEX ON users USING hnsw (embedding_vector vector_cosine_ops);
