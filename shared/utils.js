export const splitArray = (arr, size) =>
  Array.from(new Array(Math.ceil(arr.length / size)), (_, i) =>
    arr.slice(i * size, i * size + size)
  );
