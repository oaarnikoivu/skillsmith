export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE";

export type ParameterLocation = "path" | "query" | "header" | "cookie";
export type SecuritySchemeType =
  | "apiKey"
  | "http"
  | "oauth2"
  | "openIdConnect"
  | "mutualTLS"
  | "unknown";

export interface ParameterIR {
  name: string;
  location: ParameterLocation;
  required: boolean;
  schemaSummary: string;
  description?: string;
  defaultValue?: unknown;
  enumValues?: string[];
}

export interface ResponseIR {
  statusCode: string;
  description?: string;
  schemaSummary?: string;
}

export interface RequestBodyIR {
  required: boolean;
  contentTypes: string[];
  schemaSummary?: string;
}

export interface SecurityFlowIR {
  flow: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: string[];
}

export interface SecuritySchemeIR {
  name: string;
  type: SecuritySchemeType;
  description?: string;
  in?: Exclude<ParameterLocation, "path">;
  parameterName?: string;
  httpScheme?: string;
  bearerFormat?: string;
  openIdConnectUrl?: string;
  oauthFlows?: SecurityFlowIR[];
}

export interface SecurityRequirementSchemeIR {
  schemeName: string;
  scopes: string[];
}

export interface SecurityRequirementSetIR {
  schemes: SecurityRequirementSchemeIR[];
}

export interface OperationAuthIR {
  inherited: boolean;
  optional: boolean;
  requirementSets: SecurityRequirementSetIR[];
}

export interface OperationIR {
  id: string;
  summary?: string;
  method: HttpMethod;
  path: string;
  tags: string[];
  auth?: OperationAuthIR;
  parameters: ParameterIR[];
  requestBody?: RequestBodyIR;
  responses: ResponseIR[];
}

export interface SpecIR {
  title: string;
  version: string;
  servers: string[];
  securitySchemes: Record<string, SecuritySchemeIR>;
  operations: OperationIR[];
  schemas: Record<string, unknown>;
}
