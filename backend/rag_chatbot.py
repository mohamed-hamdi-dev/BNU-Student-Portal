import logging
import os
import re
import shutil
import uuid
from collections import OrderedDict
from typing import Any, Dict, List, Optional
try:
    from langchain_groq import ChatGroq
except ImportError:
    ChatGroq = None
try:
    from langchain_chroma import Chroma
except ImportError:
    try:
        from langchain_community.vectorstores import Chroma
    except ImportError:
        Chroma = None
try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:
    try:
        from langchain_community.embeddings import HuggingFaceEmbeddings
    except ImportError:
        HuggingFaceEmbeddings = None
try:
    from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
    from langchain_core.documents import Document
    from langchain_core.runnables import RunnablePassthrough
    from langchain_core.output_parsers import StrOutputParser
except ImportError:
    ChatPromptTemplate = None
    PromptTemplate = None
    Document = None
    RunnablePassthrough = None
    StrOutputParser = None

class RAGChatbot:
    """
    RAG (Retrieval-Augmented Generation) Chatbot that can answer questions
    based on indexed documents.
    """
    
    def __init__(self, persist_directory: str = "./chroma_db"):
        """
        Initialize the RAG chatbot.
        
        Args:
            persist_directory: Directory to persist the vector database
        """
        # Check for Groq API key
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError(
                "GROQ_API_KEY not found in environment variables. "
                "Please set it in your .env file or environment."
            )

        # Initialize LLM with Groq
        if ChatGroq is None:
            raise ValueError(
                "langchain-groq is not installed. Please install it with: pip install langchain-groq"
            )
        self.logger = logging.getLogger("rag_chatbot")
        self.llm = ChatGroq(
            model_name=os.getenv("RAG_LLM_MODEL", "llama-3.1-8b-instant"),
            temperature=float(os.getenv("RAG_TEMPERATURE", "0.15")),
            groq_api_key=api_key,
            request_timeout=float(os.getenv("RAG_REQUEST_TIMEOUT_SECONDS", "30")),
            max_retries=int(os.getenv("RAG_LLM_MAX_RETRIES", "1")),
        )

        # Initialize optional vector-store components.
        self.embeddings = None
        self.persist_directory = persist_directory
        self.vector_store = None
        self._retrieval_supported = False
        self._retrieval_init_attempted = False
        self.eager_retrieval_init = os.getenv("RAG_EAGER_RETRIEVAL_INIT", "false").strip().lower() == "true"
        supports_retrieval = all([
            Chroma is not None,
            HuggingFaceEmbeddings is not None,
            PromptTemplate is not None,
            RunnablePassthrough is not None,
            StrOutputParser is not None,
            Document is not None,
        ])
        self._retrieval_supported = supports_retrieval

        self._pending_persist_docs = 0
        self.persist_every_n_docs = max(1, int(os.getenv("RAG_PERSIST_EVERY_N_DOCS", "64")))

        if supports_retrieval and self.eager_retrieval_init:
            self._initialize_vector_store()
        elif not supports_retrieval:
            self.logger.warning("Retrieval dependencies are missing. Running in direct LLM mode.")

        # Store conversation history (bounded in-memory cache)
        self.conversations: "OrderedDict[str, List[Dict[str, str]]]" = OrderedDict()
        self.conversation_owner: Dict[str, str] = {}
        self.max_conversations = max(10, int(os.getenv("RAG_MAX_CONVERSATIONS", "500")))
        self.max_history_messages_per_conversation = max(4, int(os.getenv("RAG_MAX_HISTORY_MESSAGES", "20")))
        self.history_turns_in_prompt = max(0, int(os.getenv("RAG_HISTORY_TURNS_IN_PROMPT", "6")))
        self.retrieve_k = max(1, int(os.getenv("RAG_RETRIEVE_K", "6")))
        self.strict_retrieval = os.getenv("RAG_STRICT_RETRIEVAL", "true").strip().lower() == "true"
        self.strict_scope_filter = os.getenv("RAG_STRICT_SCOPE_FILTER", "false").strip().lower() == "true"
        self.allow_general_fallback = os.getenv("RAG_ALLOW_GENERAL_FALLBACK", "false").strip().lower() == "true"

        self.prompt = PromptTemplate(
            template=(
                "أنت مساعد أكاديمي جامعي تابع لجامعة بدر بالقاهرة الجديدة (BNU).\n"
                "اعتمد أولاً وحصرياً على مصادر المعرفة المرفوعة في السياق أدناه.\n"
                "لا تستخدم أي معرفة عامة أو خارجية. لا تخمّن ولا تؤلف معلومات.\n"
                "إذا كانت الإجابة غير موجودة بوضوح في السياق، قل بالضبط:\n"
                '"المعلومة غير موجودة في مصادر المعرفة الحالية."\n\n'
                "قواعد مهمة:\n"
                "- أجب باللغة العربية دائماً ما لم يطلب المستخدم غير ذلك.\n"
                "- اذكر المصدر أو رقم الصفحة إن وجد في السياق.\n"
                "- كن دقيقاً ومختصراً في الإجابة.\n\n"
                "سجل المحادثة المختصر:\n{history}\n\n"
                "السياق المسترجع من مصادر المعرفة:\n{context}\n\n"
                "السؤال:\n{question}\n\n"
                "الإجابة (من المصادر فقط):"
            ),
            input_variables=["history", "context", "question"],
        )
        self.fallback_prompt = PromptTemplate(
            template=(
                "أنت مساعد أكاديمي جامعي.\n"
                "رد بنفس لغة المستخدم.\n"
                "إذا أرسل المستخدم تحية أو رسالة عادية، رد بشكل طبيعي ومختصر.\n"
                "إذا سأل عن معلومات أكاديمية ولا توجد مصادر متاحة، قل:\n"
                '"المعلومة غير موجودة في مصادر المعرفة الحالية."\n\n'
                "سجل المحادثة:\n{history}\n\n"
                "رسالة المستخدم:\n{question}\n\n"
                "الرد:"
            ),
            input_variables=["history", "question"],
        )

    def _initialize_vector_store(self):
        self._retrieval_init_attempted = True
        os.makedirs(self.persist_directory, exist_ok=True)
        try:
            if self.embeddings is None:
                self.embeddings = HuggingFaceEmbeddings(
                    model_name=os.getenv(
                        "RAG_EMBEDDING_MODEL",
                        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
                    )
                )
            self.vector_store = Chroma(
                persist_directory=self.persist_directory,
                embedding_function=self.embeddings,
            )
        except Exception as e:
            self.logger.exception("Could not initialize ChromaDB/HF embeddings: %s", e)
            self.vector_store = None

    def _ensure_vector_store(self):
        if self.vector_store is not None or not self._retrieval_supported:
            return
        self._initialize_vector_store()

    def status(self) -> Dict[str, Any]:
        retrieval_ready = self.vector_store is not None
        retrieval_message = "ready" if retrieval_ready else "vector_store_not_initialized"
        if not retrieval_ready and self._retrieval_supported and not self._retrieval_init_attempted:
            retrieval_message = "lazy_init_pending"
        return {
            "llm_ready": self.llm is not None,
            "retrieval_ready": retrieval_ready,
            "retrieval_message": retrieval_message,
            "persist_directory": self.persist_directory,
            "conversation_count": len(self.conversations),
        }

    def clear_index(self) -> Dict[str, Any]:
        self._ensure_vector_store()
        if self.vector_store is None:
            return {"cleared": False, "reason": "vector_store_not_initialized"}

        try:
            if hasattr(self.vector_store, "delete"):
                self.vector_store.delete(where={})
            if hasattr(self.vector_store, "persist"):
                self.vector_store.persist()
            self._pending_persist_docs = 0
            return {"cleared": True, "mode": "delete_where"}
        except Exception as first_exc:
            self.logger.warning("Vector delete(where={}) failed, trying rebuild: %s", first_exc)

        try:
            if os.path.isdir(self.persist_directory):
                shutil.rmtree(self.persist_directory, ignore_errors=True)
            self.vector_store = None
            self._initialize_vector_store()
            self._pending_persist_docs = 0
            if self.vector_store is None:
                return {
                    "cleared": False,
                    "mode": "rebuild_directory",
                    "reason": "vector_store_rebuild_failed",
                }
            return {"cleared": True, "mode": "rebuild_directory"}
        except Exception as rebuild_exc:
            self.logger.exception("Failed to rebuild vector store after clear: %s", rebuild_exc)
            return {"cleared": False, "reason": str(rebuild_exc)}

    def _normalize_scope_text(self, value: Any) -> str:
        text = str(value or "").strip().lower()
        if not text:
            return ""
        # Normalize Arabic and Eastern Arabic digits safely using code points.
        text = text.translate({
            ord("\u0660"): "0", ord("\u0661"): "1", ord("\u0662"): "2", ord("\u0663"): "3", ord("\u0664"): "4",
            ord("\u0665"): "5", ord("\u0666"): "6", ord("\u0667"): "7", ord("\u0668"): "8", ord("\u0669"): "9",
            ord("\u06F0"): "0", ord("\u06F1"): "1", ord("\u06F2"): "2", ord("\u06F3"): "3", ord("\u06F4"): "4",
            ord("\u06F5"): "5", ord("\u06F6"): "6", ord("\u06F7"): "7", ord("\u06F8"): "8", ord("\u06F9"): "9",
        })
        for src, dst in {
            "\u0623": "\u0627",  # أ -> ا
            "\u0625": "\u0627",  # إ -> ا
            "\u0622": "\u0627",  # آ -> ا
            "\u0629": "\u0647",  # ة -> ه
            "\u0649": "\u064A",  # ى -> ي
            "\u0624": "\u0648",  # ؤ -> و
            "\u0626": "\u064A",  # ئ -> ي
        }.items():
            text = text.replace(src, dst)
        return " ".join(text.split())

    def _normalize_dialog_text(self, value: Any) -> str:
        """Normalize casual user text for simple small-talk intent detection."""
        return self._normalize_scope_text(value)

    def _smalltalk_reply(self, message: str) -> Optional[str]:
        text = self._normalize_dialog_text(message)
        if not text:
            return None

        greetings = {
            "اهلا", "اهلا وسهلا", "مرحبا", "السلام عليكم", "هاي", "hello", "hi",
            "hey", "اهل", "هلا", "ازيك", "ازيك",
        }
        how_are_you = {
            "كيف حالك", "كيفك", "عامل اي", "عامل ايه", "how are you", "how are u",
        }
        wellbeing = {
            "بخير", "الحمد لله", "كويس", "تمام", "زي الفل", "good", "fine", "i am fine",
        }

        if text in greetings:
            return "أهلاً! كيف أقدر أساعدك اليوم؟"
        if text in how_are_you:
            return "أنا بخير، شكرًا. كيف أقدر أساعدك في سؤالك؟"
        if text in wellbeing:
            return "جميل. هل تحب أساعدك في شيء دراسي أو إداري؟"
        return None

    def _is_regulation_query(self, message: str) -> bool:
        text = self._normalize_scope_text(message)
        if not text:
            return False
        terms = (
            "لايحه",
            "لائحه",
            "لائحة",
            "regulation",
            "bylaw",
            "credit hours",
            "الساعات المعتمده",
            "الساعات المعتمدة",
            "انذار",
            "إنذار",
            "الفصل",
            "التظلم",
            "الحذف",
            "الاضافه",
            "الإضافة",
            "الاضافة",
            "الانسحاب",
            "التخرج",
            "التقدير",
        )
        return any(term in text for term in terms)

    def _metadata_priority_value(self, metadata: Dict[str, Any]) -> int:
        try:
            return int(str(metadata.get("priority", 0) or 0).strip())
        except Exception:
            return 0

    def _metadata_content_type(self, metadata: Dict[str, Any]) -> str:
        return str(metadata.get("content_type") or "").strip().lower()

    def _looks_like_regulation_document(self, metadata: Dict[str, Any]) -> bool:
        if self._metadata_content_type(metadata) == "regulation":
            return True

        for field in ("file_name", "storage_file_name", "keywords", "category", "source"):
            value = self._normalize_scope_text(metadata.get(field))
            if any(term in value for term in ("لايحه", "لائحه", "regulation", "bylaw", "student regulations")):
                return True
        return False

    def _score_with_priority_boost(self, base_score: float, metadata: Dict[str, Any], message: str) -> float:
        boosted = float(base_score or 0.0)
        priority_value = max(0, min(self._metadata_priority_value(metadata), 100))
        boosted += (priority_value / 100.0) * 0.20

        if self._is_regulation_query(message) and self._looks_like_regulation_document(metadata):
            boosted += 0.18

        return boosted

    def _canonical_college_key(self, value: Any) -> str:
        text = self._normalize_scope_text(value)
        if not text:
            return ""
        if "computer science" in text or "علوم الحاسب" in text or "حاسب" in text:
            return "computer_science"
        if "engineering" in text or "هندس" in text:
            return "engineering"
        if "business" in text or "اداره اعمال" in text or "تجاره" in text:
            return "business"
        if "medicine" in text or text == "طب" or " كلية الطب" in text:
            return "medicine"
        if "pharmacy" in text or "صيدل" in text:
            return "pharmacy"
        if "dentistry" in text or "اسنان" in text:
            return "dentistry"
        return ""

    def _sanitize_metadata(self, metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        data = dict(metadata or {})
        clean = {k: v for k, v in data.items() if v is not None}
        if "student_id" in clean:
            clean["student_id"] = str(clean["student_id"]).strip()
        if "owner_id" in clean:
            clean["owner_id"] = str(clean["owner_id"]).strip()
        if "level" in clean:
            clean["level"] = self._canonical_level_value(clean.get("level"))
        if "college" in clean:
            clean["college_key"] = self._canonical_college_key(clean.get("college"))
        if "college_key" in clean:
            clean["college_key"] = self._canonical_college_key(clean.get("college_key"))
        if "access_scope" in clean:
            clean["access_scope"] = str(clean["access_scope"]).strip().lower()
        return clean

    def _canonical_level_value(self, level_value: Any) -> str:
        normalized = self._normalize_scope_text(level_value or "")
        if not normalized:
            return ""

        all_year_tokens = {
            "all",
            "all years",
            "all_years",
            "allyears",
            "كل السنين",
            "كل السنوات",
            "جميع السنين",
            "جميع السنوات",
            "كافة السنين",
            "كل الدفعات",
        }
        if normalized in all_year_tokens:
            return "all"

        digits_match = re.search(r"\d+", normalized)
        if digits_match:
            return digits_match.group(0)

        word_to_digit = {
            "الاولى": "1",
            "الاولي": "1",
            "اولى": "1",
            "اولي": "1",
            "الثانية": "2",
            "الثانيه": "2",
            "الثالثة": "3",
            "الثالثه": "3",
            "الرابعة": "4",
            "الرابعه": "4",
            "الخامسة": "5",
            "الخامسه": "5",
            "السادسة": "6",
            "السادسه": "6",
            "السابعة": "7",
            "السابعه": "7",
            "الثامنة": "8",
            "الثامنه": "8",
        }
        for word, digit in word_to_digit.items():
            if word in normalized:
                return digit
        return normalized

    def _build_history_text(self, conversation_id: str) -> str:
        history = self.conversations.get(conversation_id, [])
        if not history or self.history_turns_in_prompt <= 0:
            return "لا يوجد."
        # Keep only the last N turns (user+assistant pairs -> 2N messages)
        recent = history[-(self.history_turns_in_prompt * 2):]
        lines = []
        for item in recent:
            role = "المستخدم" if item.get("role") == "user" else "المساعد"
            lines.append(f"{role}: {item.get('content', '')}")
        return "\n".join(lines) if lines else "لا يوجد."

    def _to_chroma_where(self, where: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not where:
            return None
        parts = [{key: value} for key, value in where.items() if value is not None and value != ""]
        if not parts:
            return None
        if len(parts) == 1:
            return parts[0]
        return {"$and": parts}

    def _expand_level_variants(self, level_value: str) -> List[str]:
        normalized = self._canonical_level_value(level_value or "")
        if not normalized:
            return []

        variants: List[str] = [normalized]
        all_year_tokens = {
            "all",
            "all years",
            "all_years",
            "allyears",
            "كل السنين",
            "كل السنوات",
            "جميع السنين",
            "جميع السنوات",
            "كافة السنين",
            "كل الدفعات",
        }
        if normalized in all_year_tokens:
            variants.extend(list(all_year_tokens))
            unique: List[str] = []
            seen = set()
            for item in variants:
                key = self._normalize_scope_text(item)
                if not key or key in seen:
                    continue
                seen.add(key)
                unique.append(key)
            return unique
        digits_match = re.search(r"\d+", normalized)
        digit_to_word = {
            "1": "الاولى",
            "2": "الثانية",
            "3": "الثالثة",
            "4": "الرابعة",
            "5": "الخامسة",
            "6": "السادسة",
            "7": "السابعة",
            "8": "الثامنة",
        }
        word_to_digit = {
            "الاولى": "1",
            "الاولي": "1",
            "اولى": "1",
            "اولي": "1",
            "الثانية": "2",
            "الثانيه": "2",
            "الثالثة": "3",
            "الثالثه": "3",
            "الرابعة": "4",
            "الرابعه": "4",
            "الخامسة": "5",
            "الخامسه": "5",
            "السادسة": "6",
            "السادسه": "6",
            "السابعة": "7",
            "السابعه": "7",
            "الثامنة": "8",
            "الثامنه": "8",
        }

        if digits_match:
            digit = digits_match.group(0)
            variants.append(digit)
            word = digit_to_word.get(digit)
            if word:
                variants.extend([
                    f"السنة {word}",
                    f"الفرقة {word}",
                    f"لائحة {digit}",
                    f"دفعة {digit}",
                ])
                # Keep global documents discoverable with per-year queries.
                variants.extend([
                    "all",
                    "كل السنين",
                    "كل السنوات",
                    "جميع السنوات",
                ])
        else:
            for word, digit in word_to_digit.items():
                if word in normalized:
                    variants.append(digit)
                    variants.extend([
                        f"لائحة {digit}",
                        f"دفعة {digit}",
                        "all",
                        "كل السنين",
                        "كل السنوات",
                        "جميع السنوات",
                    ])
                    break

        unique: List[str] = []
        seen = set()
        for item in variants:
            key = self._normalize_scope_text(item)
            if not key or key in seen:
                continue
            seen.add(key)
            unique.append(key)
        return unique

    def _build_scope_filters(self, retrieval_filter: Optional[Dict[str, Any]]) -> List[Optional[Dict[str, Any]]]:
        if not retrieval_filter:
            return [None]

        level = self._canonical_level_value(retrieval_filter.get("level"))
        level_variants = self._expand_level_variants(level)
        category = str(retrieval_filter.get("category") or "").strip().lower()
        college_key = self._canonical_college_key(retrieval_filter.get("college") or retrieval_filter.get("college_key"))
        preferred_content_type = str(retrieval_filter.get("preferred_content_type") or "").strip().lower()
        exact_content_type = str(retrieval_filter.get("content_type") or "").strip().lower()
        raw_sources = retrieval_filter.get("sources")
        if raw_sources is None:
            raw_sources = [retrieval_filter.get("source")] if retrieval_filter.get("source") else []
        elif not isinstance(raw_sources, (list, tuple, set)):
            raw_sources = [raw_sources]
        sources = [str(item or "").strip().lower() for item in raw_sources if str(item or "").strip()]

        extra_exact_fields: Dict[str, Any] = {}
        if category:
            extra_exact_fields["category"] = category
        if exact_content_type:
            extra_exact_fields["content_type"] = exact_content_type

        preferred_filters: List[Dict[str, Any]] = []
        if preferred_content_type:
            preferred_fields: Dict[str, Any] = {"content_type": preferred_content_type}
            if category:
                preferred_fields["category"] = category

            if level_variants and college_key:
                for lvl in level_variants:
                    base_filter = {"access_scope": "level", "level": lvl, "college_key": college_key, **preferred_fields}
                    preferred_filters.append(base_filter)
                    for source in sources:
                        preferred_filters.append({**base_filter, "source": source})

            if level_variants and not college_key:
                for lvl in level_variants:
                    base_filter = {"access_scope": "level", "level": lvl, **preferred_fields}
                    preferred_filters.append(base_filter)
                    for source in sources:
                        preferred_filters.append({**base_filter, "source": source})

            if college_key:
                base_filter = {"access_scope": "level", "college_key": college_key, **preferred_fields}
                preferred_filters.append(base_filter)
                for source in sources:
                    preferred_filters.append({**base_filter, "source": source})

            public_preferred = {"access_scope": "public", **preferred_fields}
            if sources:
                for source in sources:
                    preferred_filters.append({**public_preferred, "source": source})
            else:
                preferred_filters.append(public_preferred)

            for source in sources:
                preferred_filters.append({"source": source, "content_type": preferred_content_type})

        filters: List[Dict[str, Any]] = []
        # Student academic scope docs
        if level_variants and college_key:
            for lvl in level_variants:
                f = {"access_scope": "level", "level": lvl, "college_key": college_key}
                f.update(extra_exact_fields)
                filters.append(f)
                for source in sources:
                    scoped_level_filter = dict(f)
                    scoped_level_filter["source"] = source
                    filters.append(scoped_level_filter)
        if level_variants and not college_key:
            for lvl in level_variants:
                f = {"access_scope": "level", "level": lvl}
                f.update(extra_exact_fields)
                filters.append(f)
                for source in sources:
                    scoped_level_filter = dict(f)
                    scoped_level_filter["source"] = source
                    filters.append(scoped_level_filter)
        if college_key:
            f = {"access_scope": "level", "college_key": college_key}
            f.update(extra_exact_fields)
            filters.append(f)
            for source in sources:
                scoped_college_filter = dict(f)
                scoped_college_filter["source"] = source
                filters.append(scoped_college_filter)
        # Public docs
        public_filter: Dict[str, Any] = {"access_scope": "public"}
        public_filter.update(extra_exact_fields)
        if sources:
            for source in sources:
                scoped_public_filter = dict(public_filter)
                scoped_public_filter["source"] = source
                filters.append(scoped_public_filter)
        else:
            filters.append(public_filter)

        for source in sources:
            if not any(f.get("source") == source for f in filters):
                filters.append({"source": source})
        if category and not any(f.get("category") == category for f in filters):
            category_filter = {"category": category}
            if exact_content_type:
                category_filter["content_type"] = exact_content_type
            filters.append(category_filter)
        if exact_content_type and not any(f.get("content_type") == exact_content_type for f in filters):
            filters.append({"content_type": exact_content_type})

        # Optional fallback for legacy docs with missing metadata.
        if not self.strict_scope_filter:
            filters.append(None)

        unique_filters: List[Optional[Dict[str, Any]]] = []
        seen = set()
        for item in [*preferred_filters, *filters]:
            key = tuple(sorted((item or {}).items()))
            if key in seen:
                continue
            seen.add(key)
            unique_filters.append(item)
        return unique_filters or [None]

    def _normalize_retrieval_score(self, raw_score: Any, *, score_kind: str) -> float:
        try:
            numeric_score = float(raw_score)
        except Exception:
            numeric_score = 0.0

        normalized_kind = str(score_kind or "unknown").strip().lower()
        if normalized_kind == "distance":
            return max(0.0, min(1.0, 1.0 / (1.0 + abs(numeric_score))))
        if normalized_kind == "relevance":
            return max(0.0, min(1.0, numeric_score))
        return max(0.0, min(1.0, numeric_score))

    def _retrieve_documents(self, message: str, retrieval_filter: Optional[Dict[str, Any]]) -> List[Any]:
        scored = self.retrieve_scored_documents(message, retrieval_filter=retrieval_filter)
        return [item.get("doc") for item in scored if item.get("doc") is not None]

    def retrieve_scored_documents(self, message: str, retrieval_filter: Optional[Dict[str, Any]], k: Optional[int] = None) -> List[Dict[str, Any]]:
        self._ensure_vector_store()
        if self.vector_store is None:
            return []
        query = str(message or "").strip()
        if not query:
            return []

        target_k = int(k or max(self.retrieve_k, 12))
        filters = self._build_scope_filters(retrieval_filter)
        collected: List[Dict[str, Any]] = []
        seen_chunks: set[tuple[str, str, str, str]] = set()
        for where in filters:
            try:
                chroma_where = self._to_chroma_where(where)
                scored_pairs = []
                score_kind = "unknown"
                if hasattr(self.vector_store, "similarity_search_with_relevance_scores"):
                    score_kind = "relevance"
                    scored_pairs = self.vector_store.similarity_search_with_relevance_scores(
                        query=query,
                        k=target_k,
                        **({"filter": chroma_where} if chroma_where else {}),
                    )
                    if any(
                        not isinstance(raw_score, (int, float)) or float(raw_score) < 0.0 or float(raw_score) > 1.0
                        for _, raw_score in (scored_pairs or [])
                    ):
                        score_kind = "distance"
                elif hasattr(self.vector_store, "similarity_search_with_score"):
                    score_kind = "distance"
                    raw_pairs = self.vector_store.similarity_search_with_score(
                        query=query,
                        k=target_k,
                        **({"filter": chroma_where} if chroma_where else {}),
                    )
                    scored_pairs = [(doc, raw_score) for doc, raw_score in raw_pairs]
                else:
                    retriever = self.vector_store.as_retriever(
                        search_kwargs={"k": target_k, **({"filter": chroma_where} if chroma_where else {})}
                    )
                    docs = retriever.invoke(query)
                    scored_pairs = [(doc, 0.0) for doc in docs]

                for doc, score in (scored_pairs or []):
                    metadata = dict(getattr(doc, "metadata", {}) or {})
                    normalized_score = self._normalize_retrieval_score(score, score_kind=score_kind)
                    boosted_score = self._score_with_priority_boost(normalized_score, metadata, query)
                    self.logger.info(
                        "RAG score normalization | raw_score=%s | normalized_score=%.6f | boosted_score=%.6f | detected_type=%s",
                        score,
                        normalized_score,
                        boosted_score,
                        score_kind,
                    )
                    chunk_key = (
                        str(metadata.get("document_id") or ""),
                        str(metadata.get("page") or ""),
                        str(metadata.get("chunk") or ""),
                        str(getattr(doc, "page_content", "") or "")[:120],
                    )
                    if chunk_key in seen_chunks:
                        continue
                    seen_chunks.add(chunk_key)
                    collected.append(
                        {
                            "doc": doc,
                            "score": boosted_score,
                            "base_score": normalized_score,
                            "raw_score": score,
                            "score_kind": score_kind,
                            "metadata": metadata,
                            "applied_filter": dict(where or {}),
                        }
                    )
            except Exception as exc:
                self.logger.warning("Retriever failed for filter %s: %s", where, exc)
                continue
        collected.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
        return collected[:target_k]

    def _compact_source(self, doc: Any) -> str:
        meta = dict(getattr(doc, "metadata", {}) or {})
        src = str(meta.get("source") or meta.get("source_type") or "unknown")
        page = meta.get("page")
        chunk = meta.get("chunk")
        item = meta.get("storage_item_id")
        content_item_id = meta.get("content_item_id")
        knowledge_chunk_id = meta.get("knowledge_chunk_id")
        file_url = str(meta.get("file_url") or "").strip()
        parts = [f"source={src}"]
        if item is not None:
            parts.append(f"item={item}")
        if content_item_id is not None:
            parts.append(f"content_item={content_item_id}")
        if knowledge_chunk_id is not None:
            parts.append(f"kchunk={knowledge_chunk_id}")
        if page is not None:
            parts.append(f"page={page}")
        if chunk is not None:
            parts.append(f"chunk={chunk}")
        if file_url:
            parts.append(f"file_url={file_url}")
        return " | ".join(parts)

    def index_documents(self, documents: List[str], metadatas: Optional[List[dict]] = None):
        """
        Index documents for retrieval.
        
        Args:
            documents: List of text documents to index
            metadatas: Optional list of metadata dictionaries for each document
        """
        self._ensure_vector_store()
        if not documents:
            return
        
        if self.vector_store is None:
            raise ValueError("Vector store not initialized. ChromaDB dependencies may be missing.")
        
        if Document is None:
            raise ValueError("langchain_core Document dependency is missing.")

        # Create Document objects with normalized metadata.
        doc_objects = []
        for i, doc_text in enumerate(documents):
            metadata = metadatas[i] if metadatas and i < len(metadatas) else {}
            clean_text = str(doc_text or "").strip()
            if not clean_text:
                continue
            document_id = str((metadata or {}).get("document_id") or "").strip()
            if not document_id:
                raise ValueError("document_id is required for every indexed chunk.")
            clean_meta = self._sanitize_metadata(metadata)
            doc_objects.append(Document(page_content=clean_text, metadata=clean_meta))

        if not doc_objects:
            return

        self.vector_store.add_documents(doc_objects)
        self._pending_persist_docs += len(doc_objects)
        if hasattr(self.vector_store, "persist") and self._pending_persist_docs >= self.persist_every_n_docs:
            try:
                self.vector_store.persist()
                self._pending_persist_docs = 0
            except Exception as exc:
                self.logger.warning("Vector store persist failed: %s", exc)

    def flush(self):
        """Force persist pending vector changes."""
        self._ensure_vector_store()
        if self.vector_store is None or not hasattr(self.vector_store, "persist"):
            return
        try:
            self.vector_store.persist()
            self._pending_persist_docs = 0
        except Exception as exc:
            self.logger.warning("Vector store flush failed: %s", exc)

    def _ensure_conversation_capacity(self):
        while len(self.conversations) > self.max_conversations:
            oldest_id, _ = self.conversations.popitem(last=False)
            self.conversation_owner.pop(oldest_id, None)

    def _trim_conversation_messages(self, conversation_id: str):
        history = self.conversations.get(conversation_id, [])
        if len(history) > self.max_history_messages_per_conversation:
            self.conversations[conversation_id] = history[-self.max_history_messages_per_conversation:]

    def chat(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        student_id: Optional[str] = None,
        retrieval_filter: Optional[Dict[str, Any]] = None,
        fallback_retrieval_filter: Optional[Dict[str, Any]] = None,
        require_retrieval: Optional[bool] = None,
        retrieve_context: bool = True,
        min_retrieval_score: Optional[float] = None,
        allow_general_fallback_override: Optional[bool] = None,
    ) -> Dict:
        """
        Chat with the RAG chatbot.
        
        Args:
            message: User's question
            conversation_id: Optional conversation ID for maintaining context
        
        Returns:
            Dictionary with:
            - answer: The chatbot's response
            - conversation_id: The conversation ID
            - sources: List of source documents (if available)
        """
        if require_retrieval is None:
            require_retrieval = self.strict_retrieval

        # Generate or use conversation ID
        if not conversation_id:
            conversation_id = str(uuid.uuid4())
        
        # Bind conversation to student (if provided)
        normalized_student_id = str(student_id).strip() if student_id else None
        if normalized_student_id and conversation_id not in self.conversation_owner:
            self.conversation_owner[conversation_id] = normalized_student_id
        elif normalized_student_id and conversation_id in self.conversation_owner:
            owner = self.conversation_owner.get(conversation_id)
            if owner and owner != normalized_student_id:
                # Prevent attaching someone else's conversation to another student
                conversation_id = str(uuid.uuid4())
                self.conversation_owner[conversation_id] = normalized_student_id

        # Initialize conversation history if needed.
        if conversation_id not in self.conversations:
            self.conversations[conversation_id] = []
            self._ensure_conversation_capacity()
        else:
            self.conversations.move_to_end(conversation_id)
        
        # Add user message to history
        self.conversations[conversation_id].append({"role": "user", "content": message})

        # Deterministic small-talk handling to avoid repetitive greeting loops.
        if not require_retrieval:
            smalltalk = self._smalltalk_reply(message)
            if smalltalk:
                answer = smalltalk
                sources: List[str] = []
                self.conversations[conversation_id].append({"role": "assistant", "content": answer})
                self._trim_conversation_messages(conversation_id)
                return {
                    "answer": answer,
                    "conversation_id": conversation_id,
                    "sources": sources,
                }
        
        # Retrieve context with scope filtering only when requested by caller.
        scored_docs = self.retrieve_scored_documents(message, retrieval_filter=retrieval_filter) if retrieve_context else []
        score_threshold = float(min_retrieval_score) if min_retrieval_score is not None else 0.0
        top_score = float(scored_docs[0].get("score") or 0.0) if scored_docs else 0.0

        if retrieve_context and fallback_retrieval_filter and (not scored_docs or top_score < score_threshold):
            fallback_scored_docs = self.retrieve_scored_documents(message, retrieval_filter=fallback_retrieval_filter)
            fallback_top_score = float(fallback_scored_docs[0].get("score") or 0.0) if fallback_scored_docs else 0.0
            if fallback_scored_docs and (not scored_docs or fallback_top_score >= top_score):
                scored_docs = fallback_scored_docs
                top_score = fallback_top_score

        docs = [item.get("doc") for item in scored_docs if item.get("doc") is not None]
        has_context = bool(docs)
        allow_general_fallback = self.allow_general_fallback if allow_general_fallback_override is None else bool(allow_general_fallback_override)

        if not has_context:
            if allow_general_fallback:
                # Only use general fallback if explicitly allowed
                try:
                    history_text = self._build_history_text(conversation_id)
                    prompt_input = self.fallback_prompt.format(history=history_text, question=message)
                    response = self.llm.invoke(prompt_input)
                    fallback_answer = response.content if hasattr(response, "content") else str(response)
                    fallback_answer += "\n\n⚠️ هذه إجابة عامة وليست من مصادر المعرفة المرفوعة."
                except Exception:
                    fallback_answer = "المعلومة غير موجودة في مصادر المعرفة الحالية."
            else:
                fallback_answer = (
                    "المعلومة غير موجودة في مصادر المعرفة الحالية. "
                    "يرجى التواصل مع المسؤول أو رفع المستند المناسب."
                )
            sources = []
            self.conversations[conversation_id].append({"role": "assistant", "content": fallback_answer})
            self._trim_conversation_messages(conversation_id)
            return {
                "answer": fallback_answer,
                "conversation_id": conversation_id,
                "sources": sources,
                "retrieved_docs": [],
                "rag_used": False,
                "no_sources_found": True,
            }
        else:
            try:
                context = "\n\n".join(str(getattr(doc, "page_content", "") or "") for doc in docs)
                history_text = self._build_history_text(conversation_id)
                prompt_input = self.prompt.format(
                    history=history_text,
                    context=context,
                    question=message,
                )
                response = self.llm.invoke(prompt_input)
                answer = response.content if hasattr(response, "content") else str(response)
                sources = [self._compact_source(doc) for doc in docs]
                retrieved_docs = [
                    {**dict(getattr(item.get("doc"), "metadata", {}) or {}), "_score": item.get("score"), "_base_score": item.get("base_score")}
                    for item in scored_docs
                    if item.get("doc") is not None
                ]
            except Exception as exc:
                self.logger.exception("LLM invoke failed: %s", exc)
                answer = "تعذر توليد الإجابة الآن. حاول مرة أخرى بعد قليل."
                sources = [self._compact_source(doc) for doc in docs]
                retrieved_docs = [
                    {**dict(getattr(item.get("doc"), "metadata", {}) or {}), "_score": item.get("score"), "_base_score": item.get("base_score")}
                    for item in scored_docs
                    if item.get("doc") is not None
                ]

        # Add assistant response to history
        self.conversations[conversation_id].append({"role": "assistant", "content": answer})
        self._trim_conversation_messages(conversation_id)
        
        return {
            "answer": answer,
            "conversation_id": conversation_id,
            "sources": sources,
            "retrieved_docs": retrieved_docs,
            "rag_used": True,
            "no_sources_found": False,
        }
    
    def get_conversation_history(self, conversation_id: str) -> List[Dict]:
        """Get conversation history for a given conversation ID."""
        return self.conversations.get(conversation_id, [])



