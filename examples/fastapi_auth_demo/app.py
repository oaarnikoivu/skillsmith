from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Response, Security, status
from fastapi.security import (
    APIKeyCookie,
    APIKeyHeader,
    HTTPAuthorizationCredentials,
    HTTPBasic,
    HTTPBasicCredentials,
    HTTPBearer,
    OAuth2PasswordBearer,
    OAuth2PasswordRequestForm,
)
from pydantic import BaseModel, Field

TransportType = Literal["bus", "tram", "metro"]
Severity = Literal["low", "medium", "high"]

DEMO_BASIC_USERNAME = "admin"
DEMO_BASIC_PASSWORD = "admin-password"
DEMO_BEARER_TOKEN = "demo-bearer-token"
DEMO_HEADER_API_KEY = "demo-header-api-key"
DEMO_SESSION_TOKEN = "demo-session-token"
DEMO_OAUTH_USERNAME = "oauth-user"
DEMO_OAUTH_PASSWORD = "oauth-password"
DEMO_OAUTH_TOKEN = "demo-oauth-token"

basic_auth = HTTPBasic(scheme_name="BasicAuth", auto_error=False)
bearer_auth = HTTPBearer(scheme_name="BearerAuth", auto_error=False)
api_key_header_auth = APIKeyHeader(
    name="x-api-key",
    scheme_name="ApiKeyHeaderAuth",
    auto_error=False,
)
api_key_cookie_auth = APIKeyCookie(
    name="session_token",
    scheme_name="SessionCookieAuth",
    auto_error=False,
)
oauth2_auth = OAuth2PasswordBearer(tokenUrl="/oauth/token", scheme_name="OAuth2PasswordAuth")


class HealthOut(BaseModel):
    status: str
    time: datetime


class RouteOut(BaseModel):
    route_id: str
    name: str
    city: str
    transport_type: TransportType
    active_stops: int


class RouteSearchOut(BaseModel):
    total: int
    items: list[RouteOut]


class CreateDepotIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=2, max_length=120)
    max_vehicles: int = Field(ge=1, le=500)


class DepotOut(BaseModel):
    depot_id: str
    name: str
    city: str
    max_vehicles: int


class SessionLoginIn(BaseModel):
    username: str
    password: str


class SessionLoginOut(BaseModel):
    message: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProfileOut(BaseModel):
    subject: str
    auth_method: str


class IncidentOut(BaseModel):
    incident_id: str
    route_id: str
    severity: Severity
    reported_at: datetime
    status: Literal["open", "mitigated"]


class DispatchIn(BaseModel):
    vehicle_id: str
    route_id: str
    departs_at: datetime
    driver_notes: str | None = None


class DispatchOut(BaseModel):
    dispatch_id: str
    vehicle_id: str
    route_id: str
    departs_at: datetime
    status: Literal["scheduled"]


class AlertOut(BaseModel):
    id: str
    level: Severity
    message: str


app = FastAPI(
    title="City Transit Control API",
    version="1.0.0",
    description=(
        "Demo API with mixed route shapes and multiple OpenAPI security schemes "
        "(basic, bearer, apiKey header, apiKey cookie, OAuth2 password)."
    ),
    servers=[{"url": "https://api.city-transit-control.local"}],
)

route_store: dict[str, RouteOut] = {
    "route-1": RouteOut(
        route_id="route-1",
        name="North Loop",
        city="Helsinki",
        transport_type="tram",
        active_stops=18,
    ),
    "route-2": RouteOut(
        route_id="route-2",
        name="Airport Express",
        city="Helsinki",
        transport_type="bus",
        active_stops=7,
    ),
}


def require_basic_auth(
    credentials: Annotated[HTTPBasicCredentials | None, Depends(basic_auth)],
) -> HTTPBasicCredentials:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing basic authentication credentials.",
            headers={"WWW-Authenticate": "Basic"},
        )

    is_valid_user = secrets.compare_digest(credentials.username, DEMO_BASIC_USERNAME)
    is_valid_password = secrets.compare_digest(credentials.password, DEMO_BASIC_PASSWORD)
    if not (is_valid_user and is_valid_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid basic authentication credentials.",
            headers={"WWW-Authenticate": "Basic"},
        )

    return credentials


def require_bearer_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_auth)],
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not secrets.compare_digest(credentials.credentials, DEMO_BEARER_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return credentials.credentials


def require_api_key_header(
    x_api_key: Annotated[str | None, Security(api_key_header_auth)],
) -> str:
    if x_api_key is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing x-api-key header.",
        )

    if not secrets.compare_digest(x_api_key, DEMO_HEADER_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid x-api-key header.",
        )

    return x_api_key


def require_session_cookie(
    session_token: Annotated[str | None, Security(api_key_cookie_auth)],
) -> str:
    if session_token is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing session_token cookie.",
        )

    if not secrets.compare_digest(session_token, DEMO_SESSION_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid session_token cookie.",
        )

    return session_token


def require_oauth2_token(token: Annotated[str, Depends(oauth2_auth)]) -> str:
    if not secrets.compare_digest(token, DEMO_OAUTH_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OAuth2 access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token


def require_bearer_or_api_key(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_auth)],
    x_api_key: Annotated[str | None, Security(api_key_header_auth)],
) -> str:
    if credentials and credentials.scheme.lower() == "bearer":
        if secrets.compare_digest(credentials.credentials, DEMO_BEARER_TOKEN):
            return "bearer"

    if x_api_key and secrets.compare_digest(x_api_key, DEMO_HEADER_API_KEY):
        return "api_key_header"

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Provide a valid bearer token or x-api-key header.",
        headers={"WWW-Authenticate": "Bearer"},
    )


@app.get("/public/health", response_model=HealthOut, tags=["public"])
def health() -> HealthOut:
    return HealthOut(status="ok", time=datetime.now(tz=timezone.utc))


@app.get("/public/routes", response_model=RouteSearchOut, tags=["public"])
def list_routes(
    city: str | None = Query(default=None),
    transport_type: TransportType | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> RouteSearchOut:
    routes = list(route_store.values())

    if city is not None:
        routes = [route for route in routes if route.city.lower() == city.lower()]

    if transport_type is not None:
        routes = [route for route in routes if route.transport_type == transport_type]

    paged = routes[offset : offset + limit]
    return RouteSearchOut(total=len(routes), items=paged)


@app.get("/public/routes/{route_id}", response_model=RouteOut, tags=["public"])
def get_route(route_id: str) -> RouteOut:
    route = route_store.get(route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")
    return route


@app.post(
    "/basic/admin/depots",
    response_model=DepotOut,
    status_code=status.HTTP_201_CREATED,
    tags=["basic-auth"],
)
def create_depot(
    payload: CreateDepotIn,
    _credentials: Annotated[HTTPBasicCredentials, Depends(require_basic_auth)],
) -> DepotOut:
    return DepotOut(
        depot_id="depot-1",
        name=payload.name,
        city=payload.city,
        max_vehicles=payload.max_vehicles,
    )


@app.get("/bearer/operators/me", response_model=ProfileOut, tags=["bearer-auth"])
def bearer_profile(_token: Annotated[str, Depends(require_bearer_token)]) -> ProfileOut:
    return ProfileOut(subject="operator-41", auth_method="bearer")


@app.get(
    "/apikey-header/system-metrics",
    response_model=dict[str, int],
    tags=["api-key-header"],
)
def header_key_metrics(_key: Annotated[str, Depends(require_api_key_header)]) -> dict[str, int]:
    return {
        "active_routes": len(route_store),
        "active_vehicles": 112,
    }


@app.post("/session/login", response_model=SessionLoginOut, tags=["api-key-cookie"])
def session_login(payload: SessionLoginIn, response: Response) -> SessionLoginOut:
    if payload.username != DEMO_BASIC_USERNAME or payload.password != DEMO_BASIC_PASSWORD:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    response.set_cookie(
        key="session_token",
        value=DEMO_SESSION_TOKEN,
        httponly=True,
        samesite="lax",
    )
    return SessionLoginOut(message="Session cookie issued.")


@app.get(
    "/apikey-cookie/incidents",
    response_model=list[IncidentOut],
    tags=["api-key-cookie"],
)
def cookie_incidents(_cookie: Annotated[str, Depends(require_session_cookie)]) -> list[IncidentOut]:
    return [
        IncidentOut(
            incident_id="inc-1",
            route_id="route-1",
            severity="medium",
            reported_at=datetime(2026, 3, 1, 7, 30, tzinfo=timezone.utc),
            status="open",
        )
    ]


@app.post("/oauth/token", response_model=TokenOut, tags=["oauth2"])
def oauth_token(form_data: Annotated[OAuth2PasswordRequestForm, Depends()]) -> TokenOut:
    if (
        form_data.username != DEMO_OAUTH_USERNAME
        or form_data.password != DEMO_OAUTH_PASSWORD
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OAuth username/password.",
        )

    return TokenOut(access_token=DEMO_OAUTH_TOKEN)


@app.get("/oauth/profile", response_model=ProfileOut, tags=["oauth2"])
def oauth_profile(_token: Annotated[str, Depends(require_oauth2_token)]) -> ProfileOut:
    return ProfileOut(subject="dispatcher-7", auth_method="oauth2-password")


@app.post(
    "/oauth/dispatches",
    response_model=DispatchOut,
    status_code=status.HTTP_201_CREATED,
    tags=["oauth2"],
)
def create_dispatch(
    payload: DispatchIn,
    _token: Annotated[str, Depends(require_oauth2_token)],
) -> DispatchOut:
    return DispatchOut(
        dispatch_id="dispatch-1",
        vehicle_id=payload.vehicle_id,
        route_id=payload.route_id,
        departs_at=payload.departs_at,
        status="scheduled",
    )


@app.get("/hybrid/alerts", response_model=AlertOut, tags=["hybrid-auth"])
def hybrid_alert(auth_method: Annotated[str, Depends(require_bearer_or_api_key)]) -> AlertOut:
    return AlertOut(
        id="alert-1",
        level="low",
        message=f"Hybrid-authenticated via {auth_method}.",
    )
