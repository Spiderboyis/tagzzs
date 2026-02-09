# app/api/user_database/content.py
import time
import uuid
import random
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from pydantic import BaseModel, Field
from urllib.parse import urlparse

# Internal imports
from app.api.dependencies import get_current_user
from app.utils.supabase.auth import create_auth_error, create_auth_response
from app.utils.supabase.supabase_client import supabase


class AddContentSchema(BaseModel):
    userId: str = Field(..., min_length=1)
    link: str
    title: str = Field(default="Untitled")
    contentType: Optional[str] = "article"
    description: Optional[str] = ""
    personalNotes: str = ""
    readTime: str = ""
    tagsId: List[str] = []
    tagsData: Optional[List[Dict[str, Any]]] = None
    thumbnailUrl: Optional[str] = None
    rawContent: str = ""
    summary: Optional[str] = ""
    analyzeWithAI: bool = False  # If True, save first and run extraction in background


class EmbeddingMetadata(BaseModel):
    chromaDocIds: Optional[List[str]] = None
    summaryDocId: Optional[str] = None
    chunkCount: Optional[int] = None


class ContentDataSchema(BaseModel):
    createdAt: str
    tagsId: List[str]
    link: str
    title: str
    description: str
    contentType: str
    contentSource: str
    personalNotes: str
    readTime: str
    updatedAt: str
    thumbnailUrl: Optional[str] = None
    rawContent: Optional[str] = None
    embeddingMetadata: Optional[EmbeddingMetadata] = None
    processingTime: Optional[float] = None

    class Config:
        populate_by_name = True


# update schemas
class UpdateFields(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    link: Optional[str] = None
    contentType: Optional[str] = None
    personalNotes: Optional[str] = None
    personalNotesBlocks: Optional[List[Any]] = None
    readTime: Optional[str] = None
    tagsId: Optional[List[str]] = None


class PutRequestBody(UpdateFields):
    userId: str
    contentId: str


# get schema
class ContentQueryFilters(BaseModel):
    limit: Optional[int] = Field(None, gt=0, le=100)
    offset: Optional[int] = 0
    tagId: Optional[str] = None
    contentType: Optional[str] = None
    sortBy: Optional[str] = "newest"


router = APIRouter(prefix="/api/user-database/content", tags=["Content Management"])


@router.post("/add")
async def add_content(req: Request):
    start_time = time.time() * 1000
    user_id = None
    content_id = None

    try:
        try:
            user = await get_current_user(req)
        except Exception:
            return create_auth_error(message="Authentication required to add content")

        user_id = user["id"]

        try:
            body = await req.json()
        except Exception:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": {"code": "INVALID_JSON", "message": "Invalid JSON format"},
                },
            )

        # VALIDATION
        data_with_user_id = {**body, "userId": user_id}
        try:
            validated_data = AddContentSchema(**data_with_user_id)
        except ValidationError as e:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": {"code": "VALIDATION_ERROR", "message": str(e)},
                },
            )

        # PREP METADATA & IDS
        content_id = body.get("contentId") or str(uuid.uuid4())
        embedding_metadata = {}

        # AI EMBEDDING (Logic remains the same, not pushed to Supabase yet)
        # TODO: INTEGRATE THIS AFTER THE SUPABASE MIGRATION
        raw_c = validated_data.rawContent or ""
        desc = validated_data.description or ""
        if len(raw_c.strip()) > 0 or len(desc.strip()) > 0:
            try:
                from app.api.embed import embed_and_store_chunks

                embedding_payload = {
                    "user_id": user_id,
                    "content_id": content_id,
                    "extracted_text": (raw_c or desc or "")
                    + (
                        f"\n\nUser Notes:\n{validated_data.personalNotes}"
                        if validated_data.personalNotes
                        else ""
                    ),
                    "summary": validated_data.summary or desc or "",
                    "tags": validated_data.tagsId or [],
                    "source_url": str(validated_data.link),
                    "source_type": validated_data.contentType or "",
                }
                emb_data = await embed_and_store_chunks(embedding_payload)
                if emb_data.get("success"):
                    embedding_metadata = {
                        "chromaDocIds": emb_data.get("chroma_doc_ids", []),
                        "summaryDocId": emb_data.get("summary_doc_id", ""),
                        "chunkCount": emb_data.get("chunk_count", 0),
                    }
            except Exception as e:
                print(f"Embedding failed: {e}")

        if hasattr(validated_data, "tagsData") and validated_data.tagsData:
            try:
                # We need to process parents first, then children
                # Simplistic approach: Just try create all.
                # Actually, if we have {name: "Child", parent: "Parent"}, "Parent" must exist.
                # So we can do two passes or sort.

                # Filter out pure strings if mixed (AddContentSchema defines List[Dict] usually but Pydantic might complain if mixed)
                # Let's assume validation passed and we have list of dicts/any.

                # Check imports
                # Check imports
                from app.utils.tag_slugs_generator import generate_tag_slug

                # Sort by level (0 -> 1 -> 2) to ensure parents exist before children
                # If level is missing, default to 0 (top level)
                sorted_tags = sorted(
                    validated_data.tagsData,
                    key=lambda x: int(x.get("level", 0)) if isinstance(x, dict) else 0,
                )

                # Maintain a local cache of {slug: id} for tags created/resolved in this transaction
                known_tag_ids = {}

                for t in sorted_tags:
                    if isinstance(t, dict):
                        t_name = t.get("name")
                        p_name = t.get("parent")
                        # level = t.get("level", 0) # unused but implicit in sort

                        if not t_name:
                            continue

                        # Resolve Parent ID if parent name exists
                        p_id = None
                        p_slug = None

                        if p_name:
                            p_slug = generate_tag_slug(p_name)
                            # Check local cache first (avoids read-after-write race condition)
                            if p_slug in known_tag_ids:
                                p_id = known_tag_ids[p_slug]
                            else:
                                # Helper to fetch parent with slight retry
                                for retry in range(2):
                                    p_res = (
                                        supabase.table("tags")
                                        .select("tagid")
                                        .eq("userid", user_id)
                                        .eq("slug", p_slug)
                                        .execute()
                                    )
                                    if p_res.data:
                                        p_id = p_res.data[0]["tagid"]
                                        known_tag_ids[p_slug] = p_id  # Cache it
                                        break
                                    else:
                                        time.sleep(0.2)

                        # Create/Get Tag
                        # Create/Get Tag
                        rpc_res = supabase.rpc(
                            "get_or_create_tag",
                            {
                                "p_tag_name": t_name,
                                "p_userid": user_id,
                                "p_color_code": f"#{random.randint(0, 0xFFFFFF):06x}",
                                "p_parent_id": p_id,
                            },
                        ).execute()

                        # capture the returned ID if possible
                        # If get_or_create_tag returns the tagid, we can cache it immediately.
                        # Assuming it returns UUID or similar.
                        current_slug = generate_tag_slug(t_name)
                        if rpc_res.data:
                            # It might return a scalar ID or a dict
                            new_id = rpc_res.data
                            # If data is string (uuid), use it
                            if isinstance(new_id, str):
                                known_tag_ids[current_slug] = new_id
                        else:
                            # Fallback: Query it immediately if rpc didn't return it
                            # This ensures the NEXT iteration can find this tag as a parent
                            try:
                                chk = (
                                    supabase.table("tags")
                                    .select("tagid")
                                    .eq("userid", user_id)
                                    .eq("slug", current_slug)
                                    .execute()
                                )
                                if chk.data:
                                    known_tag_ids[current_slug] = chk.data[0]["tagid"]
                            except Exception:
                                pass

            except Exception as e:
                print(f"Tag Hierarchy Sync Error: {e}")

        try:
            tag_color_map = {
                tag: f"#{random.randint(0, 0xFFFFFF):06x}"
                for tag in validated_data.tagsId
            }

            # Determine processing status based on analyzeWithAI flag
            processing_status = "pending" if validated_data.analyzeWithAI else "completed"

            result = supabase.rpc(
                "sync_full_content",
                {
                    "p_contentid": content_id,
                    "p_userid": user_id,
                    "p_title": validated_data.title or "Untitled",
                    "p_content_link": str(validated_data.link),
                    "p_description": validated_data.description,
                    "p_thumbnail_url": validated_data.thumbnailUrl,
                    "p_content_type": validated_data.contentType,
                    "p_content_source": str(urlparse(validated_data.link).netloc)
                    if "://" in validated_data.link
                    else "local",
                    "p_read_time": int(validated_data.readTime or 0),
                    "p_raw_content": validated_data.rawContent,
                    "p_note_data": {"text": validated_data.personalNotes},
                    "p_tag_map": tag_color_map,
                    "p_embedding_metadata": embedding_metadata if not validated_data.analyzeWithAI else None,
                },
            ).execute()

            if hasattr(result, "error") and result.error:
                raise Exception(result.error.message)
            
            # Update processing_status separately (backward compatible - column may not exist yet)
            if validated_data.analyzeWithAI:
                try:
                    supabase.table("content").update({
                        "processing_status": processing_status
                    }).eq("contentid", content_id).execute()
                except Exception as status_err:
                    print(f"Could not update processing_status (column may not exist): {status_err}")

        except Exception as db_error:
            print(f"Supabase Sync Error: {db_error}")
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": {
                        "code": "STORAGE_FAILED",
                        "message": "Failed to sync content to Supabase",
                        "details": str(db_error),
                    },
                },
            )

        # If analyzeWithAI is True, spawn background task for extraction
        if validated_data.analyzeWithAI:
            async def background_extraction():
                try:
                    url = str(validated_data.link)
                    extracted_title = "Untitled"
                    extracted_description = ""
                    extracted_thumbnail = None
                    extracted_raw_content = ""
                    extracted_content_type = validated_data.contentType or "article"
                    
                    # Determine URL type and extract content
                    is_youtube = "youtube.com" in url or "youtu.be" in url
                    final_tags = []  # Initialize at top level
                    
                    if is_youtube:
                        # YouTube extraction
                        try:
                            from app.services.extractors.youtube import extract_youtube_content
                            from app.services.extractors.youtube.output_structuring import structure_youtube_extraction_output
                            
                            response = await extract_youtube_content(url)
                            structured = structure_youtube_extraction_output(response)
                            
                            content_data = structured.get("content", {})
                            metadata = structured.get("metadata", {})
                            
                            extracted_title = content_data.get("title") or metadata.get("originalTitle") or metadata.get("title") or "Untitled"
                            extracted_description = content_data.get("summary") or content_data.get("description") or ""
                            extracted_thumbnail = metadata.get("thumbnailUrl") or metadata.get("thumbnail_url")
                            extracted_raw_content = content_data.get("transcript") or content_data.get("extracted_text") or ""
                            extracted_content_type = "video"
                            
                            # Extract tags from YouTube response
                            raw_tags = structured.get("tags", [])
                            # structured['tags'] is a list of dicts: [{'tag': '...', ...}]
                            final_tags = [t.get("tag") for t in raw_tags if t.get("tag")]
                        except Exception as yt_err:
                            print(f"YouTube extraction failed: {yt_err}")
                            final_tags = []
                    else:
                        # Website extraction
                        final_tags = []
                        try:
                            from app.services.extractors.web import extract_content
                            
                            response = await extract_content(url)
                            
                            if response.success:
                                if response.meta_data:
                                    extracted_title = response.meta_data.title or response.meta_data.og_title or response.meta_data.twitter_title or "Untitled"
                                    extracted_description = response.meta_data.description or response.meta_data.og_description or response.meta_data.twitter_description or ""
                                    extracted_thumbnail = response.meta_data.og_image or response.meta_data.twitter_image or response.meta_data.thumbnail_url

                                if response.cleaned_data:
                                    extracted_raw_content = response.cleaned_data.main_content or ""
                                    
                                    # Fallback if description is empty but we have content
                                    if not extracted_description and extracted_raw_content:
                                        extracted_description = extracted_raw_content[:200] + "..."
                                    
                                    # Generate AI Tags for website content
                                    if extracted_raw_content and len(extracted_raw_content) >= 20:
                                        try:
                                            from app.services.refiners.tag_generators import generate_tags
                                            
                                            tag_response = await generate_tags(extracted_raw_content[:3000], top_k=5)
                                            
                                            if tag_response.success and tag_response.tags:
                                                final_tags = [t.name for t in tag_response.tags]
                                        except Exception as tag_err:
                                            print(f"Tag generation failed: {tag_err}")
                        except Exception as web_err:
                            try:
                                print(f"Website extraction failed: {web_err}")
                            except:
                                pass
                    
                    # Update content record with extracted data
                    update_data = {
                        "title": extracted_title,
                        "description": extracted_description,
                        "thumbnail_url": extracted_thumbnail,
                        "content_type": extracted_content_type,
                        "processing_status": "completed",
                        "updated_at": datetime.now().isoformat()
                    }
                    
                    supabase.table("content").update(update_data).eq("contentid", content_id).execute()

                    # Save generated tags
                    if final_tags:
                        from app.utils.tag_slugs_generator import generate_tag_slug
                        
                        for tag_name in final_tags:
                            try:
                                tk = tag_name.strip()
                                if not tk: continue

                                # Generate proper slug
                                slug = generate_tag_slug(tk)
                                
                                # Check if tag exists (using correct column names: tagid, tag_name)
                                tag_res = supabase.table("tags").select("tagid").eq("slug", slug).eq("userid", user_id).execute()
                                tag_id = None
                                if tag_res.data:
                                    tag_id = tag_res.data[0]['tagid']
                                else:
                                    # Create new tag using RPC (same pattern as manual tag creation)
                                    try:
                                        rpc_res = supabase.rpc(
                                            "get_or_create_tag",
                                            {
                                                "p_tag_name": tk,
                                                "p_userid": user_id,
                                                "p_color_code": f"#{random.randint(0, 0xFFFFFF):06x}",
                                                "p_parent_id": None,
                                            },
                                        ).execute()
                                        
                                        # RPC returns the tag ID
                                        if rpc_res.data:
                                            if isinstance(rpc_res.data, str):
                                                tag_id = rpc_res.data
                                            elif isinstance(rpc_res.data, dict):
                                                tag_id = rpc_res.data.get("tagid") or rpc_res.data.get("id")
                                        
                                        # If RPC didn't return ID, fetch it
                                        if not tag_id:
                                            chk = supabase.table("tags").select("tagid").eq("slug", slug).eq("userid", user_id).execute()
                                            if chk.data:
                                                tag_id = chk.data[0]["tagid"]
                                    except Exception as rpc_err:
                                        print(f"Tag RPC failed for {tk}: {rpc_err}")
                                
                                # Link to Content (using correct column names: contentid, tagid, userid)
                                if tag_id:
                                    try:
                                        supabase.table("content_tags").insert({
                                            "contentid": content_id,
                                            "tagid": tag_id,
                                            "userid": user_id  # Required NOT NULL column
                                        }).execute()
                                    except Exception:
                                        # Ignore duplicate link errors
                                        pass
                                        
                            except Exception as tag_save_err:
                                print(f"Failed to save tag {tag_name}: {tag_save_err}")
                    
                    # Update raw content
                    if extracted_raw_content:
                        supabase.table("rawcontent").upsert({
                            "contentid": content_id,
                            "userid": user_id,
                            "rawcontent": extracted_raw_content
                        }).execute()
                    
                    # Run embedding if we have content
                    if extracted_raw_content or extracted_description:
                        try:
                            from app.api.embed import embed_and_store_chunks
                            
                            embedding_payload = {
                                "user_id": user_id,
                                "content_id": content_id,
                                "extracted_text": extracted_raw_content or extracted_description,
                                "summary": extracted_description,
                                "tags": validated_data.tagsId or [],
                                "source_url": url,
                                "source_type": extracted_content_type,
                            }
                            emb_data = await embed_and_store_chunks(embedding_payload)
                            
                            if emb_data.get("success"):
                                supabase.table("content_embeddings").upsert({
                                    "contentid": content_id,
                                    "userid": user_id,
                                    "chroma_doc_ids": emb_data.get("chroma_doc_ids", []),
                                    "summary_doc_id": emb_data.get("summary_doc_id", ""),
                                    "chunk_count": emb_data.get("chunk_count", 0),
                                    "updated_at": datetime.now().isoformat(),
                                }).execute()
                        except Exception as e:
                            print(f"Background embedding failed: {e}")
                    
                    print(f"Background extraction completed for content_id: {content_id}")
                    
                except Exception as e:
                    print(f"Background extraction failed: {e}")
                    import traceback
                    traceback.print_exc()
                    # Mark content as failed
                    supabase.table("content").update({
                        "processing_status": "failed",
                        "updated_at": datetime.now().isoformat()
                    }).eq("contentid", content_id).execute()
            
            # Start background task
            asyncio.create_task(background_extraction())

        processing_time = time.time() - start_time
        return create_auth_response(
            data={
                "contentId": content_id,
                "processingStatus": processing_status,
                "processingTime": processing_time,
                "message": "Content synced successfully to Supabase",
                "timestamp": datetime.now(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
            },
            user=user,
            status_code=201,
        )

    except Exception as error:
        import traceback

        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {"code": "INTERNAL_ERROR", "message": str(error)},
            },
        )


@router.delete("/delete")
async def delete_content(
    request: Request, user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        if not user:
            return create_auth_error("Authentication required to delete content")

        user_id = user.get("id")

        # Get the request body
        body = await request.json()
        content_id: Optional[str] = body.get("contentId")

        if not content_id:
            return JSONResponse(
                content={"error": "Content ID is required"}, status_code=400
            )

        # 1. Fetch content details (thumbnail) AND embedding metadata before deletion
        content_res = (
            supabase.table("content")
            .select("thumbnail_url")
            .eq("contentid", content_id)
            .eq("userid", user_id)
            .execute()
        )

        if not content_res.data:
            return JSONResponse(content={"error": "Content not found"}, status_code=404)

        thumbnail_url = content_res.data[0].get("thumbnail_url")

        # 2. Fetch IDs from content_embeddings table
        emb_res = (
            supabase.table("content_embeddings")
            .select("chroma_doc_ids, summary_doc_id")
            .eq("contentid", content_id)
            .execute()
        )

        chroma_doc_ids = []
        summary_doc_id = None
        if emb_res.data:
            emb_record = emb_res.data[0]
            chroma_doc_ids = emb_record.get("chroma_doc_ids") or []
            summary_doc_id = emb_record.get("summary_doc_id")

        # 3. Delete from ChromaDB
        if chroma_doc_ids or summary_doc_id:
            try:
                from app.connections import get_user_collection

                if chroma_doc_ids:
                    try:
                        chunks_collection = get_user_collection(user_id, "chunks")
                        chunks_collection.delete(ids=chroma_doc_ids)
                    except Exception:
                        pass

                if summary_doc_id:
                    try:
                        summaries_collection = get_user_collection(user_id, "summaries")
                        summaries_collection.delete(ids=[summary_doc_id])
                    except Exception:
                        pass
            except Exception as e:
                print(f"Warning: Failed to delete embeddings from Chroma: {e}")

        # 4. Delete from Supabase (Cascade will handle content_embeddings rows)
        supabase.table("content").delete().eq("contentid", content_id).eq(
            "userid", user_id
        ).execute()

        # 5. Delete thumbnail from Storage
        if thumbnail_url:
            try:
                file_name = thumbnail_url.split("/")[-1]
                if file_name:
                    # Assumes your 'user_thumbnails' bucket structure matches the filename extraction
                    supabase.storage.from_("user_thumbnails").remove(
                        [f"{user_id}/{file_name}"]
                    )
            except Exception as storage_error:
                print(f"Warning: Error deleting thumbnail: {storage_error}")

        return JSONResponse(
            content={
                "success": True,
                "message": "Content and associated data deleted successfully",
                "contentId": content_id,
            },
            status_code=200,
        )

    except Exception:
        import traceback

        traceback.print_exc()
        return JSONResponse(content={"error": "Internal server error"}, status_code=500)


@router.put("/edit")
async def update_content(
    request: Request, user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        if not user:
            return create_auth_error("Authentication required to edit content")

        body_dict = await request.json()
        user_id = user["id"]
        content_id = body_dict.get("contentId")

        if not content_id:
            return JSONResponse(
                status_code=400, content={"error": "Content ID is required"}
            )

        updates = {}
        if "title" in body_dict:
            updates["title"] = body_dict["title"]
        if "description" in body_dict:
            updates["description"] = body_dict["description"]
        if "link" in body_dict:
            updates["link"] = body_dict["link"]
            updates["contentSource"] = urlparse(body_dict["link"]).hostname
        if "contentType" in body_dict:
            updates["contentType"] = body_dict["contentType"]
        if "readTime" in body_dict:
            # Convert HH:MM or string to integer minutes if needed
            updates["readTime"] = body_dict["readTime"]

        # Handle Tags (Generate colors for new tags if provided)
        tag_map = None
        if "tagsId" in body_dict:
            tag_map = {
                tag: f"#{random.randint(0, 0xFFFFFF):06x}"
                for tag in body_dict["tagsId"]
            }

        # Check for semantic updates that require re-embedding
        semantic_update = False
        re_embedding_metadata = None

        # Fields that affect embeddings
        if (
            any(k in updates for k in ["title", "description", "link"])
            or "rawContent" in body_dict
            or "personalNotes" in body_dict
            or "personalNotesBlocks" in body_dict
        ):
            semantic_update = True

        if semantic_update:
            try:
                # 1. Fetch current content metadata
                current_res = (
                    supabase.table("content")
                    .select("title, description, link, content_type")
                    .eq("contentid", content_id)
                    .execute()
                )

                # Fetch raw content from separate table (schema: rawcontent table)
                raw_res = (
                    supabase.table("rawcontent")
                    .select("rawcontent")
                    .eq("contentid", content_id)
                    .execute()
                )

                # Fetch existing embeddings metadata from the separate table
                emb_res = (
                    supabase.table("content_embeddings")
                    .select("chroma_doc_ids, summary_doc_id")
                    .eq("contentid", content_id)
                    .execute()
                )

                if current_res.data:
                    current_record = current_res.data[0]
                    current_raw = (
                        raw_res.data[0].get("rawcontent", "") if raw_res.data else ""
                    )

                    # DELETE OLD EMBEDDINGS
                    chroma_doc_ids = []
                    summary_doc_id = None

                    if emb_res.data:
                        emb_record = emb_res.data[0]
                        chroma_doc_ids = emb_record.get("chroma_doc_ids") or []
                        summary_doc_id = emb_record.get("summary_doc_id")

                    from app.connections import get_user_collection

                    if chroma_doc_ids:
                        try:
                            chunks_collection = get_user_collection(user_id, "chunks")
                            chunks_collection.delete(ids=chroma_doc_ids)
                        except Exception:
                            pass

                    if summary_doc_id:
                        try:
                            summaries_collection = get_user_collection(
                                user_id, "summaries"
                            )
                            summaries_collection.delete(ids=[summary_doc_id])
                        except Exception:
                            pass

                    # PREPARE NEW EMBEDDING
                    # Use updated values if present, else fallback to current record
                    new_desc = updates.get(
                        "description", current_record.get("description", "")
                    )
                    new_raw = body_dict.get("rawContent", current_raw)
                    new_notes = body_dict.get("personalNotes", "")

                    # If dealing with blocks, we might want to convert to text for embedding?
                    # For now just use provided personalNotes text if available
                    if (
                        "personalNotes" not in body_dict
                        and "personalNotesBlocks" in body_dict
                    ):
                        # Extraction from blocks for embedding is complex, skip for now or use simple text extraction
                        pass

                    if "personalNotes" not in body_dict:
                        # Fetch current notes
                        notes_res = (
                            supabase.table("personal_notes")
                            .select("note_data")
                            .eq("contentid", content_id)
                            .execute()
                        )
                        if notes_res.data and notes_res.data[0].get("note_data"):
                            new_notes = notes_res.data[0]["note_data"].get("text", "")

                    new_link = updates.get("link", current_record.get("link", ""))
                    new_type = updates.get(
                        "contentType", current_record.get("content_type", "")
                    )
                    new_tags = body_dict.get("tagsId", [])
                    if "tagsId" not in body_dict:
                        tags_res = (
                            supabase.table("content_tags")
                            .select("tagid")
                            .eq("contentid", content_id)
                            .execute()
                        )
                        if tags_res.data:
                            new_tags = [t["tagid"] for t in tags_res.data]

                    extracted_text = (new_raw or new_desc or "") + (
                        f"\n\nUser Notes:\n{new_notes}" if new_notes else ""
                    )

                    if extracted_text.strip():
                        from app.api.embed import embed_and_store_chunks

                        embedding_payload = {
                            "user_id": user_id,
                            "content_id": content_id,
                            "extracted_text": extracted_text,
                            "summary": new_desc or "",
                            "tags": new_tags,
                            "source_url": str(new_link),
                            "source_type": new_type or "article",
                        }

                        emb_data = await embed_and_store_chunks(embedding_payload)

                        if emb_data.get("success"):
                            re_embedding_metadata = {
                                "chromaDocIds": emb_data.get("chroma_doc_ids", []),
                                "summaryDocId": emb_data.get("summary_doc_id", ""),
                                "chunkCount": emb_data.get("chunk_count", 0),
                            }

            except Exception:
                pass

        # Execute Supabase RPC
        # Execute Supabase RPC
        # Note: update_full_content only accepts p_note_text (legacy), so we pass None if we are updating blocks
        # to prevent it from overwriting our block data with simple text.
        rpc_note_text = body_dict.get("personalNotes")
        if "personalNotesBlocks" in body_dict:
            rpc_note_text = None

        result = supabase.rpc(
            "update_full_content",
            {
                "p_contentid": content_id,
                "p_userid": user_id,
                "p_updates": updates,
                "p_raw_content": body_dict.get("rawContent"),
                "p_note_text": rpc_note_text,
                "p_tag_map": tag_map,
            },
        ).execute()

        # Manually update specific note data (blocks) since RPC doesn't support JSONB notes update
        if "personalNotesBlocks" in body_dict:
            from datetime import datetime

            note_payload = {
                "blocks": body_dict["personalNotesBlocks"],
                "text": body_dict.get("personalNotes", ""),
            }
            supabase.table("personal_notes").upsert(
                {
                    "contentid": content_id,
                    "userid": user_id,
                    "note_data": note_payload,
                    "updated_at": datetime.now().isoformat(),
                }
            ).execute()

        if hasattr(result, "error") and result.error:
            raise Exception(result.error.message)

        # If we had new embedding metadata, update it now
        if re_embedding_metadata:
            try:
                # Update the content_embeddings table
                from datetime import datetime

                supabase.table("content_embeddings").upsert(
                    {
                        "contentid": content_id,
                        "userid": user_id,
                        "chroma_doc_ids": re_embedding_metadata["chromaDocIds"],
                        "summary_doc_id": re_embedding_metadata["summaryDocId"],
                        "chunk_count": re_embedding_metadata["chunkCount"],
                        "updated_at": datetime.now().isoformat(),
                    }
                ).execute()
            except Exception:
                pass

        updated_res = (
            supabase.table("content")
            .select(
                "*, notes:personal_notes(note_data), tags:content_tags(tag_details:tags(tagid, tag_name, color_code))"
            )
            .eq("contentid", content_id)
            .eq("userid", user_id)
            .execute()
        )

        if not updated_res.data:
            return JSONResponse(
                status_code=404, content={"error": "Updated content not found"}
            )

        item = updated_res.data[0]

        nested_tags = item.pop("tags", [])
        tags_id_list = [
            t["tag_details"]["tagid"] for t in nested_tags if t.get("tag_details")
        ]
        notes_list = item.pop("notes", [])
        personal_notes_text = (
            notes_list[0]["note_data"].get("text", "") if notes_list else ""
        )

        mapped_item = {
            "id": item.get("contentid"),
            "title": item.get("title"),
            "description": item.get("description"),
            "link": item.get("link"),
            "contentType": item.get("content_type"),
            "personalNotes": personal_notes_text,
            "tagsId": tags_id_list,
            "createdAt": item.get("created_at"),
            "updatedAt": item.get("updated_at"),
            "thumbnailUrl": item.get("thumbnail_url"),
        }

        return {"success": True, "data": mapped_item}

    except Exception as e:
        print(f"Supabase Update Error: {e}")
        return JSONResponse(status_code=500, content={"error": "Internal server error"})


@router.post("/get")
async def get_user_content(request: Request, user: dict = Depends(get_current_user)):
    try:
        if not user:
            return create_auth_error("Authentication required to get content")

        user_id = user["id"]

        # Parse request body
        try:
            body_data = await request.json()
        except Exception:
            pass
        filters = ContentQueryFilters(**body_data)

        query = (
            supabase.table("content")
            .select(
                "*, notes:personal_notes(note_data), tags:content_tags(tag_details:tags(tagid, tag_name, color_code, parent_id))"
            )
            .eq("userid", user_id)
            .eq("is_deleted", False)
        )

        content_id = body_data.get("contentId")
        if content_id:
            query = query.eq("contentid", content_id)

        if filters.tagId:
            query = query.filter("content_tags.tagid", "eq", filters.tagId)
        if filters.contentType:
            query = query.eq("content_type", filters.contentType)

        sort_col = "created_at"
        is_desc = True
        if filters.sortBy == "oldest":
            is_desc = False
        elif filters.sortBy == "title":
            sort_col, is_desc = "title", False
        elif filters.sortBy == "updated":
            sort_col = "updated_at"

        query = query.order(sort_col, desc=is_desc)

        # Pagination
        if filters.limit:
            start = filters.offset or 0
            query = query.range(start, start + filters.limit - 1)

        response = query.execute()
        raw_data = response.data

        content_list = []
        for item in raw_data:
            # Extract full tag details
            nested_tags = item.pop("tags", [])
            # Map to frontend structure - matching Tag interface in useTags.ts mostly,
            # but usually frontend expects tagsId to be IDs...
            # Wait, mapped_item has "tagsId". If I change this to objects, frontend might break if it expects strings.
            # But earlier I saw ItemModal expects Tag[] objects via "tags" prop.
            # The ContentItem interface in frontend likely has "tags: Tag[]" OR we are using "tagsId" for something else.
            # Let's check mapped_item keys. It has "tagsId".
            # I should add "tags" field to mapped_item with full objects.

            tags_list = []
            for t in nested_tags:
                if t.get("tag_details"):
                    td = t["tag_details"]
                    # Normalize keys to camelCase if needed by frontend Tag interface (id, tagName, tagColor, parentId)
                    tags_list.append(
                        {
                            "id": td["tagid"],
                            "tagName": td["tag_name"],
                            "tagColor": td["color_code"],
                            "parentId": td.get("parent_id"),
                        }
                    )

            tags_id_list = [t["id"] for t in tags_list]

            # Flatten Personal Notes
            notes_list = item.pop("notes", [])
            personal_notes_text = ""
            personal_notes_blocks = []

            if notes_list and isinstance(notes_list[0].get("note_data"), dict):
                note_data = notes_list[0]["note_data"]
                personal_notes_text = note_data.get("text", "")
                personal_notes_blocks = note_data.get("blocks", [])

            # Create the camelCase object matching your Frontend 'ContentItem'
            mapped_item = {
                "id": item.get("contentid"),
                "title": item.get("title", "Untitled"),
                "description": item.get("description", ""),
                "link": item.get("link", ""),
                "contentType": item.get("content_type", "article"),
                "contentSource": item.get("content_source", ""),
                "thumbnailUrl": item.get("thumbnail_url"),
                "readTime": item.get("read_time", 0),
                "personalNotes": personal_notes_text,
                "personalNotesBlocks": personal_notes_blocks,
                "tagsId": tags_id_list,
                "tags": tags_list,
                "createdAt": item.get("created_at"),
                "updatedAt": item.get("updated_at"),
                "processingStatus": item.get("processing_status", "completed"),
            }
            content_list.append(mapped_item)

        return {
            "success": True,
            "data": content_list,
            "count": len(content_list),
            "pagination": {
                "limit": filters.limit,
                "offset": filters.offset,
                "hasMore": len(content_list) == filters.limit
                if filters.limit
                else False,
            },
        }

    except Exception as e:
        import traceback

        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {"code": "INTERNAL_ERROR", "message": str(e)},
            },
        )


@router.get("/status/{content_id}")
async def get_content_status(
    content_id: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)
):
    """Get the processing status of a content item for polling."""
    try:
        if not user:
            return create_auth_error("Authentication required")

        user_id = user["id"]

        result = (
            supabase.table("content")
            .select("title, processing_status")
            .eq("contentid", content_id)
            .eq("userid", user_id)
            .execute()
        )

        if not result.data:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": "Content not found"},
            )

        item = result.data[0]
        return {
            "success": True,
            "data": {
                "contentId": content_id,
                "title": item.get("title", "Untitled"),
                "processingStatus": item.get("processing_status", "completed"),
            },
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)},
        )
