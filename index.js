import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";

const app = express();
const port = 3000;

env.config();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

const db = new pg.Client({
  user: process.env.DB_USER,
  database: process.env.DB_DATABASE,
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
db.connect();

const bookTitleSearchURL = "https://openlibrary.org/search.json?q=";
const bookDescriptionSearchURL = "https://openlibrary.org";
const bookCoverURL = "https://covers.openlibrary.org/b/olid/";
let field = "id";
let order = "ASC";

async function addPLusSign(title) {
  let newTitle = title;
  return newTitle.replace(/ /g, "+");
}

async function getBooks(field, order) {
  const result = await db.query(
    `SELECT * FROM books ORDER BY ${field} ${order}`
  );
  return result.rows;
}

async function getBookDetails(title, author) {
  const result = await axios.get(
    `${bookTitleSearchURL}${await addPLusSign(
      title
    )}&author=${await addPLusSign(author)}`
  );
  const doc = result.data.docs[0];
  const descriptionKey = doc.key;
  const author_name = doc.author_name[0];
  const bookTitle = doc.title;
  const coverKey = doc.cover_edition_key;
  console.log(doc);
  let bookDescription = "";

  const response = await axios.get(
    `${bookDescriptionSearchURL}${descriptionKey}`
  );
  const data = response.data;
  try {
    if (data.description) {
      if (typeof data.description === "object") {
        bookDescription = data.description.value;
      } else {
        bookDescription = data.description;
      }
    } else if (data.subjects && data.subjects.length > 0) {
      bookDescription = `Subjects: ${data.subjects.join(", ")}`;
    } else {
      bookDescription = false;
    }
  } catch (error) {
    console.error("Error fetching book description: ", error);
    bookDescription = false;
  }

  const bookCoverImage = `${bookCoverURL}${coverKey}-M.jpg`;

  return {
    title: bookTitle,
    author: author_name,
    description: bookDescription,
    bookCover: bookCoverImage,
  };
}

app.get("/", async (req, res) => {
  let orderBy = req.query.order || "Most Recent";
  let field = "id";
  let order = "DESC";

  if (orderBy === "Oldest") {
    field = "id";
    order = "ASC";
  } else if (orderBy === "Favorite Books") {
    field = "rating";
    order = "DESC";
  } else if (orderBy === "Least Favorite Book") {
    field = "rating";
    order = "ASC";
  } else if (orderBy === "Alphabetical Order") {
    field = "title";
    order = "ASC";
  } else {
    field = "id";
    order = "DESC";
  }

  console.log("Refresh");
  console.log("Sorting by:", orderBy, field, order);
  res.render("index.ejs", { books: await getBooks(field, order), orderBy });
});

app.get("/add", (req, res) => {
  res.render("add.ejs");
});

app.get("/book/:id", async (req, res) => {
  const bookId = parseInt(req.params.id);
  const books = await getBooks(field, order);
  const book = books.find((book) => book.id === bookId);
  res.render("book.ejs", { book: book });
});

app.post("/add_book", async (req, res) => {
  try {
    let { title, author, rating, review } = req.body;
    rating = parseInt(rating);
    const date = new Date().toDateString();
    const {
      title: bookTitle,
      author: author_name,
      description: bookDescription,
      bookCover: bookCoverImage,
    } = await getBookDetails(title, author);
    try {
      await db.query(
        "INSERT INTO books (title, author, review, rating, date, description, book_cover) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          bookTitle,
          author_name,
          review,
          rating,
          date,
          bookDescription,
          bookCoverImage,
        ]
      );
    } catch (error) {
      console.log(error);
      res.render("add.ejs", { errorMessage: `The ${title} is already added.` });
    }

    res.redirect("/");
  } catch (error) {
    console.log(error);
    res.render("add.ejs", {
      errorMessage: "No book found. Please check the spelling or the author.",
      prevTitle: req.body.title,
      prevAuthor: req.body.author,
      prevRating: req.body.rating,
      prevReview: req.body.review,
    });
  }
});

app.get("/edit/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const books = await getBooks(field, order);
  const book = books.find((book) => book.id === id);
  res.render("edit.ejs", {
    id: book.id,
    title: book.title,
    author: book.author,
    rating: book.rating,
    review: book.review,
  });
});

app.post("/update", async (req, res) => {
  let { id, title, author, rating, review } = req.body;
  const date = new Date().toDateString();
  rating = parseInt(rating);
  await db.query(
    "UPDATE books SET title = $1, author = $2, rating = $3, review = $4, date = $5 WHERE id = $6",
    [title, author, rating, review, date, id]
  );
  res.redirect("/");
});

app.get("/delete/:id", async (req, res) => {
  const bookId = parseInt(req.params.id);
  await db.query("DELETE FROM books WHERE id = $1", [bookId]);
  res.redirect("/");
});

app.listen(port, () => {
  console.log("Application running in port " + port);
});
