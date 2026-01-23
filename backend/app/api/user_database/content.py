# app/api/user_database/content.py
import time
import uuid
import random
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from pydantic import BaseModel, Field, HttpUrl
from urllib.parse import urlparse

# Internal imports
from app.api.dependencies import get_current_user
from app.utils.supabase.auth import create_auth_error, create_auth_response
from app.utils.supabase.supabase_client import supabase


class AddContentSchema(BaseModel):
    userId: str = Field(..., min_length=1)
    link: str
    title: str = Field(..., min_length=1)
    contentType: Optional[str] = "article"
    description: Optional[str] = ""
    personalNotes: str = ""
    readTime: str = ""
    tagsId: List[str] = []
    thumbnailUrl: Optional[str] = None
    rawContent: str = ""
    summary: Optional[str] = ""


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
                content={"success": False, "error": {"code": "INVALID_JSON", "message": "Invalid JSON format"}}
            )

        # VALIDATION
        data_with_user_id = {**body, "userId": user_id}
        try:
            validated_data = AddContentSchema(**data_with_user_id)
        except ValidationError as e:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": {"code": "VALIDATION_ERROR", "message": str(e)}}
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
                    "extracted_text": (raw_c or desc or "") + (f"\n\nUser Notes:\n{validated_data.personalNotes}" if validated_data.personalNotes else ""),
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


        try:
            tag_color_map = {
                tag: f"#{random.randint(0, 0xFFFFFF):06x}" 
                for tag in validated_data.tagsId
            }

            result = supabase.rpc("sync_full_content", {
                "p_contentid": content_id,
                "p_userid": user_id,
                "p_title": validated_data.title,
                "p_content_link": str(validated_data.link),
                "p_description": validated_data.description,
                "p_thumbnail_url": validated_data.thumbnailUrl,
                "p_content_type": validated_data.contentType,
                "p_content_source": str(urlparse(validated_data.link).netloc) if "://" in validated_data.link else "local",
                "p_read_time": int(validated_data.readTime or 0),
                "p_raw_content": validated_data.rawContent,
                "p_note_data": {"text": validated_data.personalNotes},
                "p_tag_map": tag_color_map,
                "p_embedding_metadata": embedding_metadata
            }).execute()

            if hasattr(result, 'error') and result.error:
                raise Exception(result.error.message)

        except Exception as db_error:
            print(f"Supabase Sync Error: {db_error}")
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": {
                        "code": "STORAGE_FAILED",
                        "message": "Failed to sync content to Supabase",
                        "details": str(db_error)
                    }
                }
            )

        processing_time = time.time() - start_time
        return create_auth_response(
            data={
                "contentId": content_id,
                "processingTime": processing_time,
                "message": "Content synced successfully to Supabase",
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            },
            user=user,
            status_code=201,
        )

    except Exception as error:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": str(error)}}
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
        content_res = supabase.table("content") \
            .select("thumbnail_url") \
            .eq("contentid", content_id) \
            .eq("userid", user_id) \
            .execute()

        if not content_res.data:
            return JSONResponse(content={"error": "Content not found"}, status_code=404)

        thumbnail_url = content_res.data[0].get("thumbnail_url")
        
        # 2. Fetch IDs from content_embeddings table
        emb_res = supabase.table("content_embeddings").select("chroma_doc_ids, summary_doc_id").eq("contentid", content_id).execute()
        
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
        delete_res = supabase.table("content") \
            .delete() \
            .eq("contentid", content_id) \
            .eq("userid", user_id) \
            .execute()

        # 5. Delete thumbnail from Storage
        if thumbnail_url:
            try:
                file_name = thumbnail_url.split("/")[-1]
                if file_name:
                    # Assumes your 'user_thumbnails' bucket structure matches the filename extraction
                    supabase.storage.from_("user_thumbnails").remove([f"{user_id}/{file_name}"])
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
            return JSONResponse(status_code=400, content={"error": "Content ID is required"})


        updates = {}
        if "title" in body_dict: updates["title"] = body_dict["title"]
        if "description" in body_dict: updates["description"] = body_dict["description"]
        if "link" in body_dict:
            updates["link"] = body_dict["link"]
            updates["contentSource"] = urlparse(body_dict["link"]).hostname
        if "contentType" in body_dict: updates["contentType"] = body_dict["contentType"]
        if "readTime" in body_dict: 
            # Convert HH:MM or string to integer minutes if needed
            updates["readTime"] = body_dict["readTime"] 

        # Handle Tags (Generate colors for new tags if provided)
        tag_map = None
        if "tagsId" in body_dict:
            tag_map = {tag: f"#{random.randint(0, 0xFFFFFF):06x}" for tag in body_dict["tagsId"]}

        # Check for semantic updates that require re-embedding
        semantic_update = False
        re_embedding_metadata = None
        
        # Fields that affect embeddings
        if any(k in updates for k in ["title", "description", "link"]) or \
           "rawContent" in body_dict or "personalNotes" in body_dict:
            semantic_update = True

        if semantic_update:
            try:
                # 1. Fetch current content metadata
                current_res = supabase.table("content").select("title, description, link, content_type").eq("contentid", content_id).execute()
                
                # Fetch raw content from separate table (schema: rawcontent table)
                raw_res = supabase.table("rawcontent").select("rawcontent").eq("contentid", content_id).execute()
                
                # Fetch existing embeddings metadata from the separate table
                emb_res = supabase.table("content_embeddings").select("chroma_doc_ids, summary_doc_id").eq("contentid", content_id).execute()

                if current_res.data:
                    current_record = current_res.data[0]
                    current_raw = raw_res.data[0].get("rawcontent", "") if raw_res.data else ""
                    
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
                            summaries_collection = get_user_collection(user_id, "summaries")
                            summaries_collection.delete(ids=[summary_doc_id])
                        except Exception:
                            pass

                    # PREPARE NEW EMBEDDING
                    # Use updated values if present, else fallback to current record
                    new_title = updates.get("title", current_record.get("title", ""))
                    new_desc = updates.get("description", current_record.get("description", ""))
                    new_raw = body_dict.get("rawContent", current_raw)
                    new_notes = body_dict.get("personalNotes", "") 
                    
                    if "personalNotes" not in body_dict:
                        # Fetch current notes
                        notes_res = supabase.table("personal_notes").select("note_data").eq("contentid", content_id).execute()
                        if notes_res.data and notes_res.data[0].get("note_data"):
                            new_notes = notes_res.data[0]["note_data"].get("text", "")
                    
                    new_link = updates.get("link", current_record.get("link", ""))
                    new_type = updates.get("contentType", current_record.get("content_type", ""))
                    new_tags = body_dict.get("tagsId", []) 
                    if "tagsId" not in body_dict:
                        tags_res = supabase.table("content_tags").select("tagid").eq("contentid", content_id).execute()
                        if tags_res.data:
                            new_tags = [t["tagid"] for t in tags_res.data]

                    extracted_text = (new_raw or new_desc or "") + (f"\n\nUser Notes:\n{new_notes}" if new_notes else "")
                    
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
                                "chunkCount": emb_data.get("chunk_count", 0)
                            }

            except Exception:
                pass

        # Execute Supabase RPC
        result = supabase.rpc("update_full_content", {
            "p_contentid": content_id,
            "p_userid": user_id,
            "p_updates": updates,
            "p_raw_content": body_dict.get("rawContent"), 
            "p_note_text": body_dict.get("personalNotes"),
            "p_tag_map": tag_map
        }).execute()

        if hasattr(result, 'error') and result.error:
            raise Exception(result.error.message)
            
        # If we had new embedding metadata, update it now
        if re_embedding_metadata:
             try:
                # Update the content_embeddings table
                from datetime import datetime
                supabase.table("content_embeddings").upsert({
                    "contentid": content_id,
                    "userid": user_id,
                    "chroma_doc_ids": re_embedding_metadata["chromaDocIds"],
                    "summary_doc_id": re_embedding_metadata["summaryDocId"],
                    "chunk_count": re_embedding_metadata["chunkCount"],
                    "updated_at": datetime.now().isoformat()
                }).execute()
             except Exception:
                 pass
        
        updated_res = supabase.table("content").select(
            "*, notes:personal_notes(note_data), tags:content_tags(tag_details:tags(tagid, tag_name, color_code))"
        ).eq("contentid", content_id).eq("userid", user_id).execute()

        if not updated_res.data:
            return JSONResponse(status_code=404, content={"error": "Updated content not found"})

        item = updated_res.data[0]

        nested_tags = item.pop("tags", [])
        tags_id_list = [t["tag_details"]["tagid"] for t in nested_tags if t.get("tag_details")]
        notes_list = item.pop("notes", [])
        personal_notes_text = notes_list[0]["note_data"].get("text", "") if notes_list else ""

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
            "thumbnailUrl": item.get("thumbnail_url")
        }

        return {
            "success": True,
            "data": mapped_item
        }

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

        query = supabase.table("content").select(
            "*, notes:personal_notes(note_data), tags:content_tags(tag_details:tags(tagid, tag_name, color_code))"
        ).eq("userid", user_id).eq("is_deleted", False)

        content_id = body_data.get("contentId")
        if content_id:
            query = query.eq("contentid", content_id)

        if filters.tagId:
            query = query.filter("content_tags.tagid", "eq", filters.tagId)
        if filters.contentType:
            query = query.eq("content_type", filters.contentType)

        sort_col = "created_at"
        is_desc = True
        if filters.sortBy == "oldest": is_desc = False
        elif filters.sortBy == "title": sort_col, is_desc = "title", False
        elif filters.sortBy == "updated": sort_col = "updated_at"

        query = query.order(sort_col, desc=is_desc)

        # Pagination
        if filters.limit:
            start = filters.offset or 0
            query = query.range(start, start + filters.limit - 1)

        response = query.execute()
        raw_data = response.data

        content_list = []
        for item in raw_data:
            # Extract only the IDs into tagsId
            nested_tags = item.pop("tags", [])
            tags_id_list = [t["tag_details"]["tagid"] for t in nested_tags if t.get("tag_details")]

            # Flatten Personal Notes
            notes_list = item.pop("notes", [])
            personal_notes_text = ""
            if notes_list and isinstance(notes_list[0].get("note_data"), dict):
                personal_notes_text = notes_list[0]["note_data"].get("text", "")

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
                "tagsId": tags_id_list,
                "createdAt": item.get("created_at"),
                "updatedAt": item.get("updated_at")
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
