Start with #3 (Ingestion Connectors) - This will make the RAG service actually usable with real documents
Implement filesystem/S3 connector first
Add document normalization and versioning
This unlocks real-world usage

Then #1 (Hybrid Retrieval - Postgres-only version) - Quick win for better search quality
Add tsvector to chunks table
Implement lexical + vector hybrid search
No new infrastructure needed (stays in Postgres)

Then #4 (Observability) - Essential for production
OpenTelemetry tracing
Prometheus metrics
Evaluation harness for regression testing

Then #2 (Reranking) - Quality improvement
Pluggable reranker interface
Improves result relevance

Finally #5 (Caching) - Performance optimization
Redis caching layers