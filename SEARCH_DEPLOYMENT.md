# New Search Function Deployment Guide

This guide walks through deploying the new `/search` edge function that uses the normalized database structure (people, experiences, educations, skills, chunks).

## Architecture Overview

The new search function implements a sophisticated semantic search pipeline:

```
User Query
    ↓
1. Generate Embedding (text-embedding-3-large, 2000 dims)
    ↓
2. Vector Search on Chunks (top 200 via RPC, HNSW index)
    ↓
3. Aggregate Chunks → People (with weighted relevance scoring)
    ↓
4. Fetch Full Data (people + experiences + educations)
    ↓
5. GPT Reranking (top 30 most relevant)
    ↓
6. Merge GPT results with enriched data
    ↓
Results
```

## Prerequisites

1. **Chunks with embeddings** - Run `generate_embeddings.py` first
2. **Database migration** - Apply the schema with `search_chunks` RPC function
3. **Environment variables** - Set in Supabase dashboard

## Step 1: Apply Database Migration

First, create the `search_chunks` RPC function:

```bash
cd /Users/vincenthuang/Documents/connectLTV-project/connectltv

# Apply the migration
supabase db push
```

Or apply directly via SQL Editor in Supabase Dashboard:

```sql
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding vector(2000),
  match_count int DEFAULT 200
)
RETURNS TABLE (
  chunk_id uuid,
  person_id uuid,
  chunk_type text,
  text_raw text,
  text_norm text,
  similarity float8
)
LANGUAGE sql STABLE
AS $$
  SELECT
    chunk_id,
    person_id,
    chunk_type,
    text_raw,
    text_norm,
    1 - (embedding <=> query_embedding) as similarity
  FROM chunks
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

## Step 2: Set Environment Variables

In your Supabase Dashboard → Settings → Edge Functions → Manage secrets:

```bash
OPENAI_API_KEY=your_openai_api_key_here
SUPABASE_URL=https://bcpwjwfubnpchoscvrum.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Or use Supabase CLI:

```bash
supabase secrets set OPENAI_API_KEY=your_key_here
```

## Step 3: Deploy the Edge Function

```bash
cd /Users/vincenthuang/Documents/connectLTV-project/connectltv

# Deploy the new search function
supabase functions deploy search

# Verify it's deployed
supabase functions list
```

## Step 4: Test the Function

### Using curl:

```bash
curl -i --location --request POST \
  'https://bcpwjwfubnpchoscvrum.supabase.co/functions/v1/search' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --data '{"query":"founders in AI and machine learning"}'
```

### Using the Supabase Dashboard:

1. Go to Edge Functions → search
2. Click "Invoke Function"
3. Enter test payload:
   ```json
   {
     "query": "product managers with experience in fintech"
   }
   ```

## Frontend Integration

The frontend uses the Supabase client library to invoke the function:

```typescript
const { data, error } = await supabase.functions.invoke('search', {
  body: { query }
});
```

See `src/services/alumniService.ts` for the full implementation.

## Key Features

### 1. **Relevance Scoring**
- Each person gets a relevance score based on their chunks
- Combines max weighted similarity (80%) and mean of top 3 (20%)
- Skills chunks are weighted at 0.5x to prevent skill-heavy profiles from dominating
- Minimum threshold of 0.35 required for GPT consideration

### 2. **Smart Aggregation**
- Top 200 chunks aggregated by person
- Top 50 people (above threshold) sent to GPT for reranking
- Reduces GPT context size while maintaining quality

### 3. **Comprehensive Data**
- Includes all experiences and educations
- Provides top matching chunks for context
- Enriched profiles merged back after GPT reranking

### 4. **Robust Fallback**
- If GPT fails, returns results ranked by relevance score
- Graceful degradation ensures search always works
- Detailed error logging for debugging

### 5. **Optimized Performance**
- HNSW index on embeddings for fast vector search
- Single RPC call for vector search
- Parallel fetching of people/experiences/educations
- Batch processing minimizes database round trips

## Response Format

```json
{
  "results": [
    {
      "person_id": "uuid",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "linkedin_url": "https://linkedin.com/in/johndoe",
      "headline": "Founder & CEO at AI Startup",
      "class_year": "2024",
      "section": "Christina Wallace",
      "location": "San Francisco, CA",
      "current_company": "AI Startup",
      "current_title": "Founder & CEO",
      "current_industry": "Technology",
      "education_summary": "Harvard Business School. MIT.",
      "experience_summary": "CEO at AI Startup. Product Manager at Google.",
      "why_relevant": "Founder with AI/ML expertise matching your search."
    }
    // ... up to 30 results
  ],
  "debug": {
    "total_time_ms": 3500,
    "steps": [...]
  }
}
```

## Monitoring

Check function logs in Supabase Dashboard:
- Edge Functions → search → Logs

Look for these log markers:
- `STEP 1: Generate Query Embedding`
- `STEP 2: Vector Search on Chunks`
- `STEP 3: Aggregate Chunks by Person`
- `STEP 4: Fetch Full Person Data`
- `STEP 5: Enrich People Data`
- `STEP 6: GPT Reranking`
- `SEARCH COMPLETE`

## Troubleshooting

### Issue: "search_chunks function not found"
**Solution**: Apply the database migration (Step 1)

### Issue: "OPENAI_API_KEY is not configured"
**Solution**: Set environment variable in Supabase (Step 2)

### Issue: "No results returned"
**Solution**: Ensure chunks have embeddings. Run `generate_embeddings.py`

### Issue: "Vector dimension mismatch"
**Solution**: Ensure chunks.embedding is vector(2000) and query uses 2000 dimensions

### Issue: GPT reranking fails
**Solution**: Check logs. Function will use fallback ranking automatically

### Issue: Location/industry/company fields are empty
**Solution**: Ensure GPT prompt includes person_id so merge lookup succeeds

## Performance Expectations

- **Query embedding**: ~200-500ms
- **Vector search**: ~50-150ms (HNSW index)
- **Data fetching**: ~50-150ms (parallel queries)
- **GPT reranking**: ~2-5 seconds
- **Total**: ~3-6 seconds end-to-end

## Cost Estimates (per search)

- **OpenAI Embedding**: ~$0.0001 (text-embedding-3-large, 2000 dims)
- **OpenAI GPT**: ~$0.001-0.003 (gpt-4o-mini)
- **Supabase**: Included in plan
- **Total per search**: ~$0.001-0.004

At 1000 searches/month: ~$1-4/month in OpenAI costs
