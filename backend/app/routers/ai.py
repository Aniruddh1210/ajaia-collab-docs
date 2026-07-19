from fastapi import APIRouter, Depends

from app.deps import CurrentUser, get_current_user
from app.schemas import AIAssistRequest, AIAssistResponse
from app.services import ai as svc

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/assist", response_model=AIAssistResponse)
async def assist(
    payload: AIAssistRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Run an AI writing action over the supplied text.

    Auth is required so the server-side Gemini key is only spent by signed-in
    users. The set of actions is fixed (see app.services.ai.ACTIONS).
    """
    result = await svc.assist(payload.action, payload.text, payload.instruction)
    return AIAssistResponse(action=payload.action, result=result)
