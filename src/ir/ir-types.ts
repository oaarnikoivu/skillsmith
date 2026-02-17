export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE";

export type ParameterLocation = "path" | "query" | "header" | "cookie";

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

export interface OperationIR {
  id: string;
  summary?: string;
  method: HttpMethod;
  path: string;
  tags: string[];
  parameters: ParameterIR[];
  requestBody?: RequestBodyIR;
  responses: ResponseIR[];
}

export interface SpecIR {
  title: string;
  version: string;
  servers: string[];
  operations: OperationIR[];
  schemas: Record<string, unknown>;
}
