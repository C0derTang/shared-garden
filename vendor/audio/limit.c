/* Shared Garden audio subprocess resource boundary. MIT licensed.
 * Copyright (c) 2026 Shared Garden contributors.
 * Permission is granted to use, copy, modify and distribute this software with
 * this notice. THE SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND.
 */
#include <sys/resource.h>
#include <unistd.h>
#include <limits.h>
#include <string.h>
#include <stdio.h>
int main(int argc, char **argv) {
  if (argc < 2 || (strcmp(argv[1], "ffmpeg") && strcmp(argv[1], "ffprobe"))) return 126;
  struct rlimit memory = {768UL * 1024 * 1024, 768UL * 1024 * 1024};
  struct rlimit cpu = {20, 20}, files = {64, 64};
  if (setrlimit(RLIMIT_AS, &memory) || setrlimit(RLIMIT_CPU, &cpu) || setrlimit(RLIMIT_NOFILE, &files)) return 126;
  char executable[PATH_MAX];
  ssize_t n = readlink("/proc/self/exe", executable, sizeof(executable) - 1);
  if (n <= 0 || n >= PATH_MAX - 8) return 126;
  executable[n] = 0;
  char *last = strrchr(executable, '/');
  if (!last) return 126;
  strcpy(last + 1, argv[1]);
  execv(executable, argv + 1);
  return 126;
}
