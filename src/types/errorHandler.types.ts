export interface SafeZodIssue {
  path: (string | number)[];
  message: string;
  code: string;
}

export interface ZIssueLike {
  path: (string | number | symbol)[];
  message: string;
  code: string;
}
